# Raw exploration: designer-portal concept & navigation map (verified 2026-09-03)

Scope: `apps/designer-portal` (Next.js, React 19) plus `apps/client-portal` (homeowner mirror) and `apps/extension` ("Patina Capture", Plasmo Chrome MV3). Cross-checked against `docs/design/the-document/CODEBASE-MAP.md`, `DECISIONS.md`, `docs/vision/VISION.md`, `.claude/skills/patina-brand-voice/SKILL.md`.

**Framing fact:** the portal's navigation was fully replaced by **"The Document."** The old tab/dashboard UI (`/portal/*` zones: Today, Pipeline, Procurement, Products, Clients, Billing, Messages, Aesthete) was deleted at "the R21 dissolve" (`DECISIONS.md` I109). `src/components/navigation/PrimaryNav.tsx` is dead code (zero imports) — never document it. **Live navigation = Studio Drawer + Document Spine + ⌘K.** `apps/designer-portal/CLAUDE.md`: "Feature flag: NONE. `the-document-pilot` is RETIRED… the Document is unconditional and `/desk` is the only landing."

## 1. Route map (`apps/designer-portal/src/app`)

### `(document)` group — the product (full-bleed; Drawer + ⌘K persist)
| Path | Page | Notes |
|---|---|---|
| `/desk` | **The Desk** | Post-login landing. Every live job grouped by stage. No metric tiles, badges, feeds. |
| `/doc/[id]` | **The Document** | Core surface; seven sections Brief → Discovery → Direction → Proposal → Project → Install → Care. |
| `/doc/[id]/plans` | Plan Room | "The current set" — floor plans. |
| `/doc/[id]/spec-book` | Spec Book | Every specified piece by room. |
| `/doc/[id]/boards` | Project Boards | Mood boards (narrow viewports; ≥1440 uses in-document shelf leaf). |
| `/library`, `/library/[id]` | Library Room / **The Piece** | Three-shelf catalog; `/library/[id]` = one item's Room. |
| `/library/judgments` | Library judgments | Curation-review sub-surface (internal name; never describe with AI language). |
| `/people` | **People Room** | Clients, leads, makers, team, field, GC, subs, installers, receivers, companies (`DIRECTORY_ROLES`). |
| `/rooms` | **The Scans** | Roster of every scanned room (registry label "The Scans", route `/rooms`). |
| `/room/[id]`, `/room/[id]/file` | Room View / Room File | One viewer per scanned room; Room File = drawings + rendered gallery. |
| `/compose` | Composing Page | Draft a new catalog piece from the Library. |
| `/drafting/[proposalId]` | **The Drafting Room** | Proposal authoring — 8 self-saving facets, no wizard. |
| `/ceremony/[leadId]` | **The Match Ceremony** | Flag `arrival-arc` + ownership gate; falls back to `/doc/[leadId]`. |
| `/board`, `/board/[boardId]`, `/boards` | Boards | Mood-board surfaces. |

### `(document-help)`: `/help`, `/help/[surfaceKey]` (keyed to registry `help.surfaceKey`, e.g. `designer-portal/document/library`), `/help/topic/[prefix]`.
### `(legal)`: `/privacy`, `/terms`. Top-level: `/`, `/auth/*` (signin, signup, signout, callback, forgot/reset-password, mfa-verify, verify-otp, accept-invite, error), `/preferences`, `/unauthorized`, `/api/*` (BFF routes, not pages).

### Primary navigation, as rendered
1. **Studio Drawer** (`src/components/document/studio-drawer.tsx`) — fixed 60px strip at the bottom, "part of the desk, never the paper." Left: wordmark (→ `/desk`) + breadcrumb. Center: three Rooms visible + a **Studio Books** doorway (recent-first) for sheet-weight ledgers. Right: in-hand time readout, **The Post** (notifications), account nameplate. Six doors from `ALL_STUDIO_SURFACES` (`src/lib/document/registry.tsx`) in fixed order: **Library, Orders, Accounts, People, The Scans, Hours.** Two weights: **Rooms** (Library, People, The Scans, Drafting Room) are walked into (puts the held document down); **Sheets** (Orders, Accounts, Hours, The Post, Call sheet) slide over the document in hand without disturbing it.
2. **Document Spine** (`src/components/document/doc-spine.tsx`, "the rail") — sticky left rail inside an open document (≥1180px; mobile uses a bottom sheet). "Put down" (back to Desk), household name, one **Strata Mark** progress glyph, stage phrase (e.g. "PROCUREMENT & ORDERS — 4 OF 6"), room-in-hand chip, the **Lens Ladder** (section jump list).
3. **Command bar ⌘K** (`src/components/document/command-bar.tsx`) — quick-open for any Room, Ledger or Verb; typed matching includes Programa/Houzz-style synonyms ("moodboards", "POs", "timesheet") so an arriving designer's old vocabulary resolves.

## 2. Vocabulary
| Term | Definition | Lives in | Status |
|---|---|---|---|
| The Document | The single living paper for one client engagement; seven sections. Presentation layer over existing project state — no `documents` table. | `/doc/[id]` | GA |
| Desk | Landing; every live job by stage; no dashboard furniture. | `/desk` | GA |
| Studio Drawer | Persistent bottom strip: Rooms + Ledgers + The Post + account. | `studio-drawer.tsx` | GA |
| Document Spine / rail | Left rail in an open document: Strata Mark, stage phrase, Lens Ladder. | `doc-spine.tsx` | GA |
| Shelved Spine | Retired rail design (I136), superseded by Smart Lens. Don't use in copy. | DECISIONS.md | Retired |
| Worktable | In-document table/pinning (`TableFrame`, `ReleaseLift`, `useTablePin`). | `components/document/worktable/*` | Flag `worktable` (never created in PostHog → dark) |
| Plan Room / Current Set | Floor-plans workspace; Current Set = active plan revision. | `/doc/[id]/plans` | GA |
| Directions | The "Direction" section: boards/scope/palette composed pre-proposal. | Document section | GA |
| Life Review | R126 visual system (rule weights, ranks, filled stamps, stage tabs) — styling ruling, not a user-facing name. | `globals.css` | GA |
| Smart Lens | R127 scroll-driven focus: sections crossfade/promote/fold; reading-window bracket on the spine. "No feature flag" by ruling (R125). | `spine/lens-ladder.tsx` | GA |
| Mood board / Boards | Client-facing image boards per project. | `/doc/[id]/boards`, `/board/*` | GA |
| Board paths | Not a distinct named concept in code — informal. Verify before external use. | — | n/a |
| FF&E | Furniture, Fixtures & Equipment line items; 8 DB stages specified → quoted → approved → ordered → production → shipped → delivered → installed. | `components/portal/ffe/*`, `ffe-section.tsx` | GA |
| Proposals (tiers, revise/supersede) | `proposals` statuses draft/sent/viewed/accepted/declined/expired/revised; `client_visibility_tier`; version chain via `parent_proposal_id`. | Drafting Room | GA |
| Schedule | FF&E line schedule inside a project's document. | `components/document/schedule/*` | GA |
| Call sheet | This-project roster of everyone on the job; sheet-weight ledger. | Studio Drawer (document scope) | Flag `call-sheet` |
| Rosters | People-room / Call-sheet listings. | `/people` | GA |
| Studio workspace | Organization/tenant; `create_studio_workspace` RPC. | Account studio page | Flag `studio-workspaces` |
| Library | Three shelves: personal / studio / marketplace. | `/library` | GA |
| Capture / Scan | Capture = Chrome extension pulls a product into the Library (also iOS room capture). Scan = LiDAR/RoomPlan room ("The Scans"). | `apps/extension`, `/rooms` | GA |
| Field Companion | Field-facing capabilities inside the document (punch-photo strips, `field_captures`). | `work-block.tsx` | GA (W4) |
| Room View / Room File | Single-room viewer; Room File = drawings + renders. | `/room/[id]`, `/room/[id]/file` | GA (R107) |
| Rendered Room | Render gallery + inline floor-plan sheet in Room File. | `components/room-file/*` | GA v2 |
| The Piece | A Library item's own Room. | `/library/[id]` | GA (R40) |
| Authorized Schedule | Commercial variant of the FF&E schedule with a client-authorization stamp layer. | `line-unfold.tsx` | GA |
| Maker's Ledger | Unfolded line's artifact plate: image, Maker, Source, configuration (R128). | Pieces spread | GA (Sept 2026) |
| Tester Notes | Internal feedback widget ("Leave a note" in ⌘K). | `tester-widget.tsx` | Flag `tester-notes` (internal) |

Other flags: `room-file`, `room-view-refined-path`, `procurement-workspace-pilot`, `arrival-arc`, `capture-producer-idempotency`.

## 3. Core journeys
**(a) Studio + invite:** signup (`/auth/signup`) → no-studio empty state → `AccountStudioPage` "Create studio" (`create_studio_workspace`; event `studio_created`) → account sheet (`components/document/account/account-sheet.tsx`) → `StudioInviteModal` → `workspace-member-invite` edge fn (`teammate_type` designer|member, role member|admin; event `teammate_invited`) → invitee email → `/auth/accept-invite` → `accept_workspace_invitation` → `/desk` (event `invitation_accepted`).
**(b) Lead → signed proposal:** "Capture a lead" (Studio Verb) begins a Brief on the Desk → optional Match Ceremony → Direction (boards/scope) + Composing Page pulling Library pieces → "Draft a design agreement" opens the Drafting Room (8 facets, Strata Mark) → send via `proposal-share-instrument.tsx` (tokenized, tiered link) → client views/accepts in client-portal `/proposals/[id]` → `activate_proposal_as_project` RPC creates the first `projects` row → document auto-advances Proposal → Project.
**(c) Client share / handoff:** Share Sheet (`components/document/overlays/share-sheet.tsx`) or proposal instrument → client-portal mirrors (`/proposals/[id]`, `/projects/[id]`, `/documents`, `/decisions/[id]`, `/orders`, `/invoices/[id]`, `/scans/[id]`, `/plans/[token]`, `/share/[token]`, `/piece/[id]`, `/rfq/[token]`, `/field/[token]`, `/evidence/[token]`) → client actions write shared tables the document reads live. **One-act-many-surfaces**: one action updates line stamp, margin, Desk, and client mirror in one transaction.
**(d) Procurement after signature:** `projects.current_phase = procurement` → FF&E lines specified → quoted → approved → **Order Assistant** (from a line unfold or the Orders ledger; 4 steps; decision-block aware) → `create_purchase_order` RPC → `po-send` edge fn (PDF + vendor email) → stamps advance via triggers (00184) → **LogInspectionDrawer** logs `receiving_inspections` (clean/damaged/partial → delivered/installed; damage opens `damage_claims`) → Accounts ledger / `invoices` (milestone, time, adhoc, ffe) via Stripe.
**(e) Extension capture → Library:** vendor page with Patina Capture → content script `src/contents/extractor.ts` (EXTRACT_FULL/QUICK/VENDOR, DETECT_MODE) → side panel `src/panel/PanelRouter.tsx` (Extracting → Record/Vendor/Snapshot → optional ImageSelect/Insight/Decision/CreateProject sheets → Saved/InboxSaved) → item lands on the personal shelf at `/library` → pulled into Direction/Proposal via Composing Page or document lines.

## 4. Roles
`organization_members.role` (00295, 00319, 00484) + `profiles.is_designer`. **Owner** (transfer ownership, promote admins, delete workspace; last-owner guard) > **Admin** (invite/manage members; cannot touch owner rows) > **Member** (working seat; full studio data access; no membership rights). **Designer** = capability flag distinguishing designer vs member invites. **Platform admin** = separate app (`apps/admin-portal`) consuming `/api/admin/*`; cross-studio operator, not a rung on the studio ladder.

## 5. Principles onboarding copy must respect
- VISION §6: **"Designer-Taught Intelligence," never "AI"** / algorithm / engine / "powered by".
- VISION §5.1: The Document is the whole product for 12 months. "One living document per engagement. No dashboards, no task manager, no tab bars. Truth-framing over taste-framing."
- VISION §4: **"You won't notice Patina."** Never optimise the studio surface for engagement. Homeowner gets the opposite promise (engaged daily on one agreed direction).
- VISION refusals: no AI label, no consumer-first, no engagement metrics as success, no tab/zone/dashboard UI, no shadows, no red/green status, no badges, no funnel-spam, no scope creep, no launching to an empty room.
- The owner "is delegating for the first time… the thing she cannot afford is a new system to learn" — onboarding must read as removing load, not adding a tool to master.
- D4 zero shadows; D1 strict focus (no split views/tabs/global nav inside a document; sheets never unmount the document); typography-first lock (Playfair / Inter / DM Mono; Strata Mark is the one progress device); documents are a presentation layer, not new data; one-act-many-surfaces (never imply "it'll sync shortly").
- Brand voice: confident/unpretentious/sensory; technology invisible; designers are the intelligence, not labor; Midwest signifiers and sourced numbers only; lexicon (prefer patina, provenance, heirloom, grain, workshop, maker, hand-built, honest materials, trade, studio; avoid disrupt, revolutionize, AI-powered, curated, luxury, elevated, bespoke, gig). Decks: Playfair headlines, Inter body, DM Mono labels; understatement over exclamation.
