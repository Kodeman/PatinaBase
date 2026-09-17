# Six core journeys — screen by screen

Verified 2026-09-03 against `apps/designer-portal/src`, `apps/client-portal/src`, `apps/extension/src`, and `supabase/`. Each step names the surface, what the user sees, what they do, and the route/component backing it. Steps not directly confirmed in code are marked **UNVERIFIED**.

---

## 1. Studio + first invite

1. **Sign up** — `/auth/signup`. A new user creates an account (Supabase Auth/GoTrue; never NextAuth for end users, despite a legacy `app/api/auth/[...nextauth]` route in the tree — UNVERIFIED whether that route is still live or dead scaffolding).
2. **No-studio empty state** — the account has no `organization_members` row yet. The account/studio area (`AccountStudioPage`) shows a "create your studio" empty state rather than any Desk content.
3. **Create studio** — the owner names and brands the studio. Submitting calls the `create_studio_workspace` RPC and fires the `studio_created` analytics event. The account sheet (`components/document/account/account-sheet.tsx`) is the surface this lives on.
4. **Studio Setup Checklist** appears — 5 steps: "Name & brand the studio" (now done), "Set your own title," "Invite your crew," "Seed the rolodex," "Open the first project" (`account/studio-setup-checklist.tsx`, `lib/document/studio-setup.ts`). A quiet whisper nudge appears after 2+ visits with the checklist still incomplete (`studio-setup-whisper.tsx`): "The studio isn't fully set up."
5. **Invite a teammate** — from the account sheet, `StudioInviteModal` (`account/studio-invite-modal.tsx`) opens. The inviter picks **Designer** or **Member/collaborator** (`teammate_type`), a permission tier (member / admin / guest — `member_role`), and optionally a job title. Submitting calls the `workspace-member-invite` edge function, which inserts the membership row, optionally grants `studio_designer`, and fires `teammate_invited`.
6. **Invitee's email** — GoTrue sends a magic/invite link. The redirect target is `/auth/callback?next=/auth/accept-invite?token=…`.
7. **Accept invite** — the invitee lands on `/auth/callback`, which exchanges the auth code for a session, then redirects to `/auth/accept-invite`. That page (`app/auth/accept-invite/page.tsx`) polls briefly for the session to hydrate, then calls `accept_workspace_invitation`. On success it fires `invitation_accepted` and, after a short pause, replaces the URL with `/desk`.
8. **Landing** — the new teammate is now on `/desk`, inside the studio's workspace. (See Journey 6 for what they see from here in more detail.)

---

## 2. Lead → signed proposal

1. **Begin a lead** — from the Desk (`/desk`), the designer opens ⌘K or a Desk action and picks the Verb **"Capture a lead."** `CaptureLeadSheet` (`overlays/capture-lead-sheet.tsx`) opens over the Desk: Name, Contact (email or phone), the project in one line, and "Where from" (free text with suggestion chips: Referral, Website quiz, Instagram, Past client — stored in `leads.source`).
2. **Brief opens** — submitting creates a `leads` row and immediately routes to `/doc/{leadId}`, the new document's **Brief** section, which the designer fills in as work happens (no separate lead-detail page to visit first).
3. **Match Ceremony (optional)** — for studios/leads where the `arrival-arc` flag and an ownership gate both resolve true, a client-arrival ritual screen is available at `/ceremony/[leadId]`; otherwise this step is skipped and the flow stays on `/doc/[leadId]`.
4. **Direction** — inside the document, the designer composes the **Direction** section: boards, scope, and palette. Library pieces are pulled in via the **Composing Page** (`/compose`).
5. **Draft a design agreement** — the Verb "Draft a design agreement" (or a document action once Direction is underway) opens the **Drafting Room** at `/drafting/[proposalId]`. Eight self-saving facets, no wizard, no tab strip, editable in any order: **Rooms, FF&E, Palette, Boards, Phases, Exclusions, Payments, Terms** (`DRAFTING_FACET_ORDER` in `rooms/drafting/drafting-room.tsx`). Returning to an in-progress draft lands the designer on the first unfinished facet.
6. **Send** — the proposal is sent via `proposal-share-instrument.tsx`, which mints a tokenized, tier-scoped link (`client_visibility_tier`). The proposal's status moves draft → sent.
7. **Client views and accepts** — the homeowner opens the client-portal mirror at `/proposals/[id]` (`apps/client-portal/src/app/proposals/[id]`). Viewing is tracked (`proposal_engagement`), moving status sent → viewed. Accepting moves it to accepted and records `signed_at`/`signed_by_name`.
8. **Project created** — acceptance triggers `activate_proposal_as_project` (RPC, first defined `00086_activate_project_rpc.sql`), which creates the first `projects` row. The document auto-advances from **Proposal** to **Project** — the same paper, further along, not a new object.

---

## 3. Client share / handoff

1. **Studio-side share** — from inside a document, the designer opens the **Share Sheet** (`overlays/share-sheet.tsx`) or uses the `proposal-share-instrument.tsx` link-minting flow described in Journey 2 for proposals specifically.
2. **Client-portal mirrors** — the homeowner's side of the relationship is a family of routes in `apps/client-portal/src/app`, confirmed in the tree: `/proposals/[id]`, `/projects/[projectId]`, `/documents`, `/decisions/[id]`, `/orders`, `/invoices/[invoiceId]`, `/scans/[scanId]`, `/plans/[token]`, `/share/[token]`, `/piece/[id]`, `/rfq/[token]`, `/field/[token]`, `/evidence/[token]`. Each mirrors one facet of the studio-side document at a scoped, often tokenized, address.
3. **Client acts** — the homeowner responds to a decision, views a scan, approves a plan revision, or pays an invoice on one of these mirror pages. The write lands in the same shared tables the studio-side document already reads.
4. **One-act-many-surfaces** — per the document's core invariant, that single client action is one database transaction that simultaneously updates the FF&E line's stamp, the margin-item feed, the Desk's "needs your hand" roster, and the client-portal mirror itself — never a queued sync. (Confirmed as an architectural rule in `apps/designer-portal/CLAUDE.md` and the `apply_decision` / PO-cascade trigger pattern in the migrations; not independently re-traced end-to-end for this document.)

---

## 4. Procurement after signature

1. **Project enters procurement** — `projects.current_phase` reaches `procurement`; FF&E lines on the document move through `specified → quoted → approved`.
2. **Order Assistant** — opened either from an unfolded FF&E line or from the **Orders** ledger (Drawer sheet). It is a step-flow panel (`components/portal/procurement/order-assistant/index.tsx`), confirmed steps: **review** (`step-review.tsx`) → **coverage** (`step-coverage.tsx`, checks which lines the vendor covers) → **details** (`step-details.tsx`, skipped for catalog-routed vendors) → **created**. It is decision-block aware — a line blocked by a pending client decision cannot be ordered through it.
3. **PO created and sent** — submitting calls `create_purchase_order` (an atomic RPC), then the `po-send` edge function renders a PDF and emails the vendor. `sent_at` and the PO document path are written on success (`00188_po_send_columns`).
4. **Stamps advance** — DB triggers (migration 00184's rank-ratchet functions) cascade PO status to FF&E line status automatically: ordered → in_production → shipped, no manual re-entry per line.
5. **Receiving** — when goods arrive, the designer or field user opens `LogInspectionDrawer` (`portal/procurement/log-inspection-drawer.tsx`), self-fetches the PO's items, and logs an outcome per item (clean / damaged / partial), writing `receiving_inspections` rows with `received_quantity`. Clean outcomes advance the line to delivered/installed; damaged or partial outcomes open a `damage_claims` row.
6. **Billing** — the Accounts ledger (Drawer sheet) draws invoices against milestone, time, FF&E, or ad-hoc line kinds, processed through Stripe. (Invoice-kind vocabulary and RPCs confirmed in `docs/design/the-document/CODEBASE-MAP.md` §3 and §6; live wiring not re-traced end-to-end for this document.)

---

## 5. Extension capture → Library

1. **Designer is on a vendor's product page** with the **Patina Capture** Chrome extension (`apps/extension`, Plasmo MV3) installed and the side panel open.
2. **Detection and extraction** — the content script (`src/contents/extractor.ts`) listens for `DETECT_MODE`, `EXTRACT_FULL`, `EXTRACT_QUICK`, and `EXTRACT_VENDOR` messages and pulls product data off the live page.
3. **Panel flow** — `src/panel/PanelRouter.tsx` renders the resulting state: an Extracting step, then a Record/Vendor/Snapshot view depending on what was detected, with optional ImageSelect, Insight, Decision, or CreateProject sheets layered in as needed.
4. **Save** — the captured item is written to the personal shelf of the Library and reaches a Saved / InboxSaved state in the panel.
5. **Lands on the shelf** — the item now appears at `/library` on the personal shelf, ready to be pulled into a project.
6. **Pulled into a document** — from Library, the designer uses the **Composing Page** (`/compose`) or an in-document line action to attach the captured piece to a project's Direction or Proposal facets.

---

## 6. A first hire's first day (accept-invite → first document)

This traces exactly what a newly invited member sees, based on the code paths in Journey 1's steps 6–8, expanded.

1. **Opens the invite email** and clicks the link GoTrue sent. It lands on `/auth/callback` with a `next` param pointing at `/auth/accept-invite?token=…`.
2. **`/auth/callback`** exchanges the magic-link code for a session, then redirects to `/auth/accept-invite`.
3. **`/auth/accept-invite` — polling state.** The page (`app/auth/accept-invite/page.tsx`) shows a "polling" status while it waits (up to 5s, checking every 300ms) for the browser's Supabase client to finish hydrating the session that the callback just established — a deliberate race-absorption step, not a visible spinner most invitees will notice.
4. **Accepting.** Once a session exists, the page calls `accept_workspace_invitation` with the token. If the token is invalid, expired, or doesn't belong to this account, the RPC deliberately returns one indistinguishable error code (`invitation_invalid_or_expired`) so a bad-token guess can't be used to fingerprint valid invites; the page then shows a friendly retry-or-contact-admin message and stops there.
5. **Success.** On a valid accept, `studioEvents` fires `invitation_accepted`-equivalent tracking (via `studio-events.ts`), a brief success state renders (`PortalAuthSuccess` from `@patina/design-system`), and after 350ms the page hard-navigates (`window.location.replace`) to `/desk`.
6. **First `/desk`.** The new member is inside the studio's workspace now — same `/desk` route every designer lands on, showing every live job in the studio grouped by stage. Because their invited role determines whether they're a **Designer** (capability flag `is_designer`) or a plain **Member**, what they can *do* on a document may differ, but the Desk itself is not role-branched UI — UNVERIFIED whether any Desk content is conditionally hidden by role; the code inspected for this document does not branch the roster query on role.
7. **Desk Walkthrough offer.** If this account was created on/after the walkthrough's ship date, `desk-walkthrough.tsx`'s gate auto-opens the WelcomeModal on this first `/desk` visit: "Take a brief tour to see how everything fits together, or jump in and explore," with a "Skip for now" secondary action. Taking the tour walks 6 coachmarks: The Desk, One client one document, Rooms and ledgers, The studio drawer, Find anything (⌘K), Begin with a lead.
8. **Margin note, if the tour is skipped.** A quieter fallback nudge, the "desk-first-touch" margin note (`components/document/margin-note.tsx`), reads roughly "This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K …" and recedes permanently on the first ⌘K use or dismissal.
9. **First document.** The new member picks up whatever live job the Desk shows, or begins a Verb of their own (Capture a lead, Open a project, etc.) — from here the experience matches Journeys 2–5 above; there is no separate "first document" onboarding path distinct from what every returning designer sees.

**Not confirmed in this pass (flag for follow-up):** whether a `Member` (non-designer) invitee sees a materially different Desk roster or drawer door set than a `Designer` invitee — the registry and Desk-roster code read do not show a role-conditional filter, but a targeted device/browser walk as a `member`-tier account was out of scope for this document. UNVERIFIED.
