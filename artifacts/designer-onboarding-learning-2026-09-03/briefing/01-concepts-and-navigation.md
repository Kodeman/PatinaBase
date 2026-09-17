# Concepts and navigation — the designer portal

For a reader who has never seen Patina. Verified 2026-09-03 against the tree (route directories, `apps/designer-portal/src/lib/document/registry.tsx`, `studio-drawer.tsx`, `doc-spine.tsx`, `command-bar.tsx`, `docs/vision/VISION.md`) — not against the older `docs/design/the-document/CODEBASE-MAP.md`, which is a June 2026 pre-build audit and describes a portal that no longer exists (see "A note on stale sources" below).

---

## What Patina is (in 200 words)

Patina connects interior designers with the makers who build the furniture they specify. It is not a marketplace app for homeowners and not an "AI design tool" — the engineering term is **Designer-Taught Intelligence**, and in any writing meant for a designer, a maker, or a homeowner, the technology stays invisible. The designer is the intelligence; Patina is the paper trail and the plumbing underneath it.

The company's customer is **a small design studio at the exact moment it hires its first help** — not the homeowner, not the maker. Homeowners are the studio's clients; makers are the studio's vendors. Patina earns from two places: a studio subscription (the floor), and a margin on furniture sold through a designer-led project (the upside, and where the first real dollar comes from).

The product itself is organized as **one living document per client engagement** — no dashboards, no tab bars, no task manager. A studio owner should never feel like she's learned a new system; she should feel like the paperwork she already did got quieter. The promise to her is that she won't notice Patina. The promise to her client, the homeowner, is the opposite: daily engagement on one agreed direction.

## The one mental model

Everything in the designer portal collapses into one shape: **Desk → Document → Rooms / Sheets / Verbs**, held together by the **Drawer**, read from inside a document by the **Spine**, and reached instantly by **⌘K**.

- **The Desk** (`/desk`) is the landing page after sign-in — the only landing page; there is no other default route. It shows every live job, grouped by stage, with no metric tiles, badges, or feed. You either pick up a document or you begin something new (a Verb).
- **The Document** (`/doc/[id]`) is the working surface for one client engagement — the studio's single paper for that relationship, walked through seven sections: **Brief → Discovery → Direction → Proposal → Project → Install → Care**. A document is a *presentation layer*, not a new database table — its sections are derived from existing project/proposal/lead state, never stored as a `documents` row.
- **Rooms** are places a designer physically walks into — picking a Room puts the document you were holding back down. Three are reachable from anywhere (**Library**, **People**, **The Scans**); a fourth, the **Drafting Room**, only exists once a proposal is in hand.
- **Sheets** (also called **Ledgers**) slide over whatever document is currently open without disturbing it — a designer glances, acts, and puts it back. Four are reachable from anywhere (**Orders**, **Accounts**, **Hours**, **The Post**); a fifth, the **Call sheet**, is scoped to the project in hand.
- **Verbs** are the front doors that start something new rather than open something that exists — "Capture a lead," "Open a project," "Draft a design agreement," "Draw an invoice," "Add a maker."

Rooms, Sheets, and Verbs are not three separate lists maintained by three components — they are one authoritative array, `ALL_STUDIO_SURFACES`, defined once in `apps/designer-portal/src/lib/document/registry.tsx` ("the Studio Surface Registry"). The Drawer, ⌘K, and the Desk's Contents page all read this same array, so a label or icon change in one file changes everywhere at once.

- **The Drawer** (`components/document/studio-drawer.tsx`) is a fixed 60px strip at the bottom of the screen — "part of the desk, never the paper." It is the one piece of chrome allowed to coexist with an open document. It carries the wordmark/breadcrumb (left), the Rooms and a Studio Books doorway for Sheets (center), and the in-hand time readout, The Post, and the account nameplate (right).
- **The Spine** (`components/document/doc-spine.tsx`, "the rail") is the sticky left rail *inside* an open document (desktop ≥1180px; a bottom sheet below that). It carries "Put down" (back to the Desk), the household name, one **Strata Mark** progress glyph, a stage phrase ("PROCUREMENT & ORDERS — 4 OF 6"), the room-in-hand chip, and the **Lens Ladder** — a jump list of the sections in view.
- **⌘K** (`components/document/command-bar.tsx`) is the quick-open command palette for any Room, Sheet, or Verb. Typed queries resolve through a generous synonym table on the registry, so a designer arriving with Programa/Houzz vocabulary — "moodboards," "POs," "timesheet" — still lands on the right door.

## Navigation, as rendered

### Drawer doors, in fixed order

Rooms and Ledgers appear in this exact order in the Drawer (from `ALL_STUDIO_SURFACES`), each tagged **Room** (walked into, puts the document down) or **Sheet** (slides over, document stays):

| # | Label | Weight | Route |
|---|---|---|---|
| 1 | **Library** | Room | `/library` |
| 2 | **Orders** | Sheet | Drawer overlay (`orders-ledger.tsx`) |
| 3 | **Accounts** | Sheet | Drawer overlay (`accounts-book.tsx`) |
| 4 | **People** | Room | `/people` |
| 5 | **The Scans** | Room | `/rooms` |
| 6 | **Hours** | Sheet | Drawer overlay (`hours-ledger.tsx`) |

**The Post** (notifications, Sheet) and the account nameplate live on the right edge of the Drawer rather than in this center list, but they are the same registry entries (`the-post`). The **Call sheet** (Sheet, document-scoped) and the **Drafting Room** (Room, document-scoped) never appear as standalone Drawer doorways — the Call sheet only describes a project once one is in hand, and the Drafting Room only exists once a proposal does.

### Spine contents (inside an open document)

Top to bottom: "Put down" link back to the Desk → household name → one Strata Mark progress glyph → stage phrase (e.g. "PROCUREMENT & ORDERS — 4 OF 6") → room-in-hand chip → the Lens Ladder (a list of section stops the current spread has scrolled past or is approaching, each clickable).

### ⌘K groups

An empty ⌘K query opens **already populated** — never a blank prompt — under DM Mono eyebrows, in this order (verified against `command-bar.tsx`, more granular than the raw scouting note):

1. **In hand** — the document currently open, if any (resume it).
2. **Recent boards** — recently opened mood boards.
3. **Recent** — documents the designer has actually visited lately.
4. **This surface** — actions scoped to the document/project in hand (only shown with one in hand).
5. **Rooms & ledgers** — the unfiltered registry list (Library, Orders, Accounts, People, The Scans, Hours, plus document-scoped surfaces when applicable).
6. **Begin** — the five Verbs (Capture a lead, Open a project, Draft a design agreement, Draw an invoice, Add a maker).
7. **Studio** — utility rows (help, account, etc.).

**How synonyms resolve:** every registry entry carries an `aliases` array folded into `matchSurfaces()`, a case-insensitive match over label + aliases. Typing "POs" or "purchase orders" resolves to **Orders**; "moodboards" or "mood board" resolves to **Boards** (the document-scoped surface, not the Drafting Room — a 2026 fix, noted in-code as "F62," retired an earlier ambiguity where "boards" could resolve to either). "Timesheet" resolves to **Hours**; "invoices"/"billing"/"receivables" resolve to **Accounts**; "crew"/"roster"/"who" resolve to the **Call sheet**. Document-scoped surfaces with no registry entry of their own — the **Plan room**, **Spec book**, and **Boards** page — are folded into the same typed-query table by `matchSurfaces()` even though they're excluded from the Drawer's unfiltered lists.

## Vocabulary

| Term | Plain-English definition | Where you find it | Status |
|---|---|---|---|
| The Document | The single working paper for one client engagement, walked through seven sections. A presentation layer over existing data — there is no `documents` database table. | `/doc/[id]` | GA |
| Desk | The only post-login landing page; every live job, grouped by stage, no dashboard furniture. | `/desk` | GA |
| Studio Drawer | The fixed bottom strip carrying Rooms, Sheets, The Post, and the account nameplate. | `studio-drawer.tsx` | GA |
| Document Spine / rail | The sticky left rail inside an open document: Strata Mark, stage phrase, Lens Ladder. | `doc-spine.tsx` | GA |
| Lens Ladder | The section jump-list printed below the Spine's rule; the reading-window bracket tracks scroll position. | `spine/lens-ladder.tsx` | GA |
| ⌘K / Command bar | The populated command palette for any Room, Sheet, or Verb, with generous synonym matching. | `command-bar.tsx` | GA |
| Studio Surface Registry | The single authoritative data file every navigation surface (Drawer, ⌘K, Desk Contents) reads from — never a set of parallel lists. | `lib/document/registry.tsx` | Internal |
| Room | A navigation weight: a place walked into; opening one puts the document in hand down. | Registry `weight: 'room'` | GA |
| Sheet / Ledger | A navigation weight: slides over the document in hand without disturbing it. | Registry `weight: 'sheet'` | GA |
| Verb | A front door that begins something new rather than opens something that exists. | Registry `kind: 'verb'` | GA |
| Library | The three-shelf catalog (personal / studio / marketplace) of furnishings. | `/library` | GA |
| The Piece | One Library item's own Room — its detail page. | `/library/[id]` | GA |
| Library judgments | Internal curation-review sub-surface; never described with AI-flavored language externally. | `/library/judgments` | GA (internal) |
| People (Room) | Everyone the studio works with — clients, leads, makers, team, field, GC, subs, installers, receivers, companies. | `/people` | GA |
| The Scans | The roster of every room a client or field visit has scanned (LiDAR/RoomPlan). | `/rooms` | GA |
| Room View / Room File | The single-room viewer for one scan, plus its drawings and rendered-image gallery. | `/room/[id]`, `/room/[id]/file` | GA |
| Rendered Room | The render gallery + inline floor-plan sheet inside a Room File. | `components/room-file/*` | GA |
| Drafting Room | Proposal-authoring surface: 8 self-saving facets, no wizard, no stepper. Only exists with a proposal in hand. | `/drafting/[proposalId]` | GA |
| Drafting facets | The 8 sections of a proposal draft, in fixed order: Rooms, FF&E, Palette, Boards, Phases, Exclusions, Payments, Terms. Any can be edited in any order; the room lands you on the first unfinished one. | `rooms/drafting/drafting-room.tsx` | GA |
| The Match Ceremony / Arrival Arc | A client-arrival ritual screen for a new lead — not a designer-onboarding surface. Falls back to the plain document if its flag/ownership gate fails. | `/ceremony/[leadId]` | Flag `arrival-arc` |
| Plan Room / Current Set | The floor-plans workspace for one project; "the current set" is its active plan revision. | `/doc/[id]/plans` | GA |
| Spec Book | Every specified piece in a project, gathered by the room it lands in. | `/doc/[id]/spec-book` | GA |
| Direction | The document section where boards, scope, and palette are composed before a proposal is drafted. | Document section | GA |
| Smart Lens | The scroll-driven focus system: sections crossfade/promote/fold in the document view, with the reading-window bracket on the Spine. Shipped unconditionally, no feature flag. | `spine/lens-ladder.tsx` | GA |
| Strata Mark | The one progress-ring device that stands in for status bars/tab strips elsewhere — the sole "progress" visual language in a document. | `strata-mark.tsx` | GA |
| Mood board / Boards | Client-facing image boards composed for a project. | `/doc/[id]/boards`, `/board/*` | GA |
| FF&E | Furniture, Fixtures & Equipment — the specified line items in a project. 8 lifecycle stages: specified → quoted → approved → ordered → production → shipped → delivered → installed. | `components/portal/ffe/*` | GA |
| Proposals | The design-agreement documents a studio drafts and sends. Statuses: draft, sent, viewed, accepted, declined, expired, revised; versioned via a parent-proposal chain. | Drafting Room | GA |
| Order Assistant | The guided flow (from a line unfold or the Orders sheet) that turns approved FF&E lines into a sent purchase order. | `procurement/order-assistant/*` | GA |
| Orders (ledger) | The sheet listing every purchase order, drawn to delivered. | Drawer overlay | GA |
| Accounts (ledger) | Invoices drawn and paid, receivables, the studio's earnings. | Drawer overlay | GA |
| Hours (ledger) | Time the studio logged — timer-caught and hand-entered. | Drawer overlay | GA |
| The Post | The notifications/inbox sheet — what arrived, what needs review. | Drawer overlay | GA |
| Call sheet | The roster of everyone on one project's job — who's on it and how to reach them. Document-scoped (needs a project in hand). | Drawer overlay (document scope) | Flag `call-sheet` |
| Rosters | People-room / Call-sheet listings generally. | `/people` | GA |
| Studio workspace | The organization/tenant record a studio operates inside. | Account studio page | Flag `studio-workspaces` |
| Studio Setup Checklist | The 5-step first-run nudge: name & brand the studio, set your own title, invite your crew, seed the rolodex, open the first project. | `account/studio-setup-checklist.tsx` | GA |
| Capture | The Chrome-extension action that pulls a vendor product into the Library. | `apps/extension` | GA |
| Scan | A LiDAR/RoomPlan room capture, from the field or a client visit, feeding The Scans. | `/rooms` | GA |
| Field Companion | Field-facing capabilities surfaced inside the document (punch-photo strips, field capture records). | `work-block.tsx` | GA |
| Authorized Schedule | The commercial variant of the FF&E schedule that carries a client-authorization stamp layer. | `line-unfold.tsx` | GA |
| Maker's Ledger | An unfolded line's artifact plate: image, maker, source, configuration. | Pieces spread | GA |
| Worktable | In-document table/pinning mechanics. | `components/document/worktable/*` | Flag `worktable` (never turned on — no PostHog flag created) |
| Shelved Spine | An earlier, retired rail design, superseded by Smart Lens. Never use in copy. | — | Retired |
| Tester Notes | The internal feedback-capture widget ("Leave a note" via ⌘K). | `tester-widget.tsx` | Flag `tester-notes` (internal, not deployed as of this writing) |
| Desk Walkthrough | The current onboarding tour: a welcome modal plus 6 coachmarks on the Desk, for new signups. Replayable via `/desk?tour=desk-walkthrough`. | `help/desk-walkthrough.tsx` | GA |
| The Document Help Center | The searchable help home, with a pinned walkthrough row, featured articles, and an 8-topic browse grid. | `/help` | GA |

## Roles

Membership in a studio is a **role** on `organization_members`, ranked:

1. **Owner** — can transfer ownership, promote admins, delete the workspace; a "last-owner" guard prevents a studio from being left ownerless.
2. **Admin** — can invite and manage members; cannot touch owner-level rows.
3. **Member** — a full working seat with full studio-data access, but no membership-management rights.

The invite flow (`workspace-member-invite` edge function) also accepts a **guest** tier, though it is not part of the raw scouting note's three-rung description — verify usage before writing it into learning copy as a distinct concept; treat it as UNVERIFIED for prominence, confirmed only as a valid `member_role` value.

Independent of that ladder is **`profiles.is_designer`**, a capability flag rather than a rung — the invite modal asks whether the person being invited is a **Designer** or a plain **Member/collaborator** (`teammate_type: 'designer' | 'member'`), which controls whether the `studio_designer` role is granted, separate from their `owner`/`admin`/`member` seniority.

**Platform admin** is a wholly separate concern: a cross-studio operator role living in a different app (`apps/admin-portal`, consuming `/api/admin/*`), never a rung on a single studio's membership ladder.

## Words we never use

Per `docs/vision/VISION.md` §6 and `.claude/skills/patina-brand-voice/SKILL.md`, onboarding and product copy must never:

- Call the technology **"AI"** — non-negotiable; the correct term is **Designer-Taught Intelligence**. Never "algorithm," "engine" (as a marketing beat), "ML," or "powered by."
- Frame the studio owner's help as **labor** or **gig** work — designers are the intelligence layer, never "our designers" as staff for hire.
- Use **tab / zone / dashboard** language for the UI — there is one living Document, typography-first; no shadows, no red/green status chips, no badges.
- Treat **engagement metrics** as a success measure for the studio surface — the studio promise is "you won't notice Patina."
- Reach for **coastal luxury signifiers** ("NYC penthouse," "LA modern") — Midwest examples only.
- Use filler words the brand-voice skill explicitly avoids: *disrupt, revolutionize, AI-powered, curated (overused), luxury, elevated (as filler), bespoke (unless literally custom), gig,* or marketplace-speak in consumer-facing copy.
- Puff up numbers — every stat in copy must be true and sourced.
- Describe the retired concept **"Shelved Spine"** as current — it was superseded by Smart Lens.

## A note on stale sources

`docs/design/the-document/CODEBASE-MAP.md` (dated 2026-06-11) is a **pre-build audit** written before the Document shipped — it describes an eight-zone tab UI (Today/Pipeline/Procurement/Products/Clients/Billing/Messages/Aesthete) at `/portal/*` that was deleted at "the R21 dissolve." It remains useful only as design-decision history (the O1–O5 rulings it opened); its route table and "zones" no longer exist in the tree and must never be cited as current navigation. The live navigation is the Drawer/Spine/⌘K system documented above, confirmed directly against `registry.tsx` and the route directories under `apps/designer-portal/src/app/(document)`.
