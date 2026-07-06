# The Document (Desk Paradigm) — Designer Portal Navigation Replacement

## 1. Header

**Area:** The Document (Desk Paradigm) — the built replacement for the Designer Portal's zone/tab navigation.

**Last reconciled:** 2026-07-06

**Per-sub-feature status:**

| Sub-feature | Status |
|---|---|
| The Desk (`/desk`) — folders, need-lines, triage bar | Shipped |
| The document shell (`/doc/[id]`) — Brief→Discovery→Direction→Proposal→Project→Install→Care | Shipped |
| The flip (`/portal` → `/desk` default) | Shipped |
| Margins (six kinds) + margin rail | Shipped |
| Coordination — the ball-in-court (Track 5) | Shipped |
| Drafting Room & proposal authoring (Track 4) | Shipped |
| Proposal watch view + nudge (R71) | Shipped (on main); ⚠ Not on prod |
| Offline (paper) signature (R92) | Shipped (on main); ⚠ Not on prod |
| People Room (R57–R60) | Shipped |
| Accounts book / money (Track 8) | Shipped |
| Project lifecycle: open-direct, close, amendment (Track 7) | Shipped |
| Library Room / the Piece | Shipped |
| Composing Page | Shipped |
| The Post (Track 10) | Shipped |
| Help (R89, ambient) | Shipped |
| Discovery (R66) | Shipped |
| Mobile shell (D13, <980px) | Shipped |
| Orders book / procurement eight (Track 2/11-M) | Shipped |
| R21 Dissolve — Stage 3 (old-URL redirects, zone removal, DocumentGate retirement, Inbox retirement, CI shadow ban) | Planned — ⚠ unbuilt |
| Spec v1.7 fold (R61–R92 + I43 consolidation) | Planned — ⚠ owed |
| Prod app-tier deploy + edge-fn catch-up + prod live-walk | Partial — ⚠ DB migrations reportedly caught up, app tier held at human deploy gate |
| Via Patina commission rate finals + Aesthete-fold Accounts rendering | Planned |
| GC/vendor real logins (`project_parties.profile_id`) | Planned |
| Semantic people-search | Planned |

**Source docs:**
- `docs/design/the-document/the-document-spec-v1.6.md`
- `docs/design/the-document/the-document-IMPLEMENTATION-INDEX.md`
- `docs/design/the-document/the-document-parity-backlog-2026-07.md`
- `docs/design/the-document/the-document-reaudit-walk-2026-07.md`
- `docs/design/the-document/the-document-needs-ruling-2026-07.md`
- `docs/design/the-document/DECISIONS.md`
- `docs/design/the-document/the-document-parity-map.md`
- `docs/design/the-document/CLAUDE.md`
- `docs/design/the-document/CODEBASE-MAP.md`
- `docs/product/portal-vs-desk-feature-gap-matrix-v2.md`
- `apps/designer-portal/src/app/(document)/layout.tsx`
- `apps/designer-portal/src/app/(document)/document-gate.tsx`
- `apps/designer-portal/src/app/(document)/desk/page.tsx`
- `apps/designer-portal/src/hooks/use-document-state.ts`
- `apps/designer-portal/src/lib/document/desk-derivation.ts`
- `supabase/migrations/00191_document_state_view.sql`
- `supabase/migrations/00221_people_directory.sql`
- `supabase/migrations/00237_open_project_direct.sql`
- `supabase/migrations/00238_close_project.sql`
- `supabase/migrations/00252_project_documents_proposal_anchor.sql`
- `supabase/migrations/00253_apply_scope_change_ownership_guard.sql`
- `supabase/migrations/00254_record_offline_signature.sql`
- `supabase/migrations/00178_invoices_v1.sql`

## 2. Overview

The Document is the built replacement for the Designer Portal's zone/tab navigation. Instead of dashboards, zones, and lists, a designer (primary user: "Leah", a solo/small-studio interior designer) opens `/desk` and sees 2–4 paper folders with truthful need-lines derived from real data; picks up one engagement as a single full-bleed **document** (`/doc/[id]`) that flows Brief → Discovery → Direction → Proposal → Project → Install → Care; and acts in the **margins** (six kinds) where one act updates the line stamp, margin, Desk, and client mirror in one transaction.

It is **designer-portal web only** (`apps/designer-portal`), flipped to default (`/portal` resolves to `/desk`) behind the PostHog flag `the-document-pilot`.

Core invariant: **it is a presentation layer — there is no `documents` table**; everything is a SQL view/derivation over existing tables (products, projects, proposals, decisions, leads, invoices, etc. all live in `public` schema as before).

The program has run from Slices 0–6 through the flip, Dissolve Tracks 1–3, Tracks 4–11, the Decision Composer, the People Room, and a 2026-07 parity re-audit + gap-closure (Waves 1–2), landing at DECISIONS **R92 / I48**.

Where it lives in the product: it is the primary workspace of `apps/designer-portal` (port 3000) — replacing the old dashboard-and-zones home. The legacy zone routes still exist underneath (`(portal)/portal/*`) as a phase-in fallback, but the default landing experience for every designer is now the Desk and its documents. It has no admin-portal, client-portal (beyond a mirrored read-only preview), iOS, or Chrome-extension surface.

## 3. As-Built Architecture

### Route group & shell
- **`apps/designer-portal/src/app/(document)/`** — the whole paradigm. `layout.tsx` mounts the zero-chrome shell: `DocumentGate` (flag gate) → `DocumentTimeProvider` (the log-offer time system) → `MobileShellProvider` (D13 phone physics <980px) → `DocumentHelpProvider` (R89 ambient help), then `StudioDrawer`, `LogStrip`, `CommandBar` (⌘K), `InterruptionSettings`, `AccountSheet`, `InvoiceOverlays`, `DraftProposalOverlay`, `MobileBar`, `MobileSheets`.
- **`(document)/document-gate.tsx`** — fail-closed gate on `useFeatureFlag('the-document-pilot')`; redirects to `/portal` when off.
- **The flip:** `(portal)/portal/page.tsx` is the *legacy* dashboard; the flip routes `/portal`→`/desk` client-side. Zone routes still live and function under `(portal)/portal/*` (D7 phase-in). ⚠ see §7 — the R21 dissolve that was meant to retire these has not executed.

### The Desk (§7)
`(document)/desk/page.tsx` → `use-desk-engagements` reads the **`document_state`** view → `src/lib/document/desk-derivation.ts` (`deriveNeed`, `deriveMotion`, `partitionDesk`, `deriveReconnectNeeds`; need/motion taxonomies, AR-overdue constants). Renders `FolderCard`, `InMotionChip`, `TriageBar`, `DeskReconnect` (People nurture-due need-line, R60). Acts open `CaptureLeadSheet` (R62) and `OpenProjectSheet` (R79).

### The document shell (§4)
`(document)/doc/[id]/page.tsx` → `src/hooks/use-document-state.ts` `useDocumentEngagement(id)` resolves ANY engagement key (engagement_id/project_id/proposal_id/lead_id) to one `document_state` row, or a **redirect** across identity thresholds: R6 (activated proposal → `/doc/{projectId}`) and F1 (accepted lead → `/doc/{designerClientId}`). Sections derive from `active_section`. Components in `src/components/document/`: `doc-spine`, `doc-letterhead`, `letterhead-vitals/-instruments`, `doc-colophon`, `margin-rail`/`margin-item`/`margin-bodies`/`line-unfold`, `ffe-section`, `brief-section`, `discovery-section`, `strata-mark` (the only progress device), `client-mirror`.

### Coordination — the ball-in-court (Track 5, §18)
`src/components/document/coordination/**` (band, court-bar, court-group, item-composer, open-item-sheet, item-resolve/* panels, task-dep-line) + `@patina/supabase` `use-coordination.ts` + `src/lib/document/coordination-derivation.ts`. Every open item = a decision with an owner (Selection/RFI/Submittal/Sign-off/Punch) in a court, resolved by a one-act cascade via `resolve_coordination_item`.

### Drafting Room & proposal authoring (Track 4, §17)
`(document)/drafting/[proposalId]/page.tsx` + `src/components/document/rooms/drafting/**` + `drafting/proposal-mirror.tsx` (live client's-copy, cost/margin/TBD excluded). Send/revise via `overlays/send-sheet.tsx`, `revise-sheet.tsx`, `doc-sheet.tsx`. Signature settles Proposal + opens Project in-place (`sign_proposal`). Watch view: `proposal-watch.tsx` + `proposal-instruments`, nudge via `proposal-nudge` edge fn.

### People Room (R57–R60, §20)
`src/components/document/people/**` (people-room, view-shell, directory/, profile/, ops/, outreach/, six views) + `@patina/supabase` `use-people.ts` + `src/lib/document/people-derivation.ts` (`deriveRelationshipJourney`, `deriveNurtureQueue`, status-dot/nurture-due separate signals; provisional thresholds). Backed by the `people_directory` view. Route `(document)/people/page.tsx`.

### Money — the Accounts book (Track 8, §8)
`src/components/document/accounts/**` (accounts-book, accounts-ledger/receivables/earnings pages, **invoice-folio**, **invoice-composer**, invoice-overlays) reusing the invoicing infra from **00178** via `@patina/supabase` `use-invoices.ts` (`useRecordPayment`, `useVoidInvoice`, issue/send). Hours ledger (`hours-ledger.tsx`) "Export week → Accounts" now opens the composer (R75). **No new migration** — a surface-only build over existing invoice RPCs + the 00187 FF&E coverage bridge.

### Project lifecycle (Track 7)
`overlays/open-project-sheet.tsx` (`open_project_direct` 00237, no-proposal projects), Care-band close (`care-band.tsx` + `close_project` 00238), `overlays/amendment-sheet.tsx` (scope changes as a paper act, guarded `apply_scope_change` 00253).

### Other surfaces
- **Library Room / the Piece:** `rooms/library`, `rooms/piece`, routes `(document)/library/page.tsx` + `library/[id]/page.tsx` (R70), import/validate/search (R88).
- **Composing Page:** `(document)/compose/page.tsx` + `compose/composing-page.tsx`.
- **The Post (Track 10, R82):** `overlays/post-sheet.tsx` reuses `useInboxNotifications`/`useInboxMessages` — the drawer bell now opens a Document home (Letters + the Record).
- **Help (R89):** `(document-help)/help` route + `help/document-help.tsx` ambient panel.
- **Offline signature (R92):** `overlays/mark-signed-sheet.tsx` → `useRecordOfflineSignature` (`record_offline_signature` 00254).
- **Orders book (Track 2/11-M):** `orders-book-*`, `orders-ledger`, `po-preview`, procurement eight (R84).
- **Discovery (R66):** `discovery/**` + `client_discovery` (00224) / `set_document_client` (00225).
- **Mobile (D13):** `mobile/**` (shell/bar/sheets/margin-chips) for <980px.

## 4. Data Model

**Core invariant: no `documents` table.** Confirmed — every document surface is a `security_invoker` VIEW or an app-layer derivation over existing tables (D7 additive-only through the phase-in).

### Derivation views
- **`document_state`** (00191) — one row per engagement, UNION of 4 shapes (project / live-proposal-chain / open-lead / pre-proposal-relationship) with derived `active_section` (§4 stage→section) + Desk need-input counts. Extended by **00192** (open claims), **00195** (pulse + send RPC), **00200** (send + money), **00211** (`proposal_updated_at`), **00230** (`proposal_open_count`/`proposal_last_opened_at`), **00236** (relationship title coalesce).
- **`margin_items`** (00194, note branch 00197) — read model for the six margin kinds; anchors/pulses in **00193/00196**.
- **`people_directory`** (00221) — `security_invoker` view, `UNION ALL` of clients (`designer_clients`) + open leads (`leads`) + makers (`vendors`/`saved_vendors`/`project_parties`) + GCs (`project_parties`) + team (`project_team_members`).

### Coordination stack (Track 5)
`project_parties` (**00212**, `profile_id` nullable = tracked-not-logged-in), `coordination_kind`/`court`/`blocks_kind`/`answer` widened onto `client_decisions` (**00213**, orthogonal to `decision_type` 00084 + `decision_kind` 00202), `coordination_item_revisions` table (**00214**, written only via the RPC-only `submit_coordination_revision` defined in **00218**), task dependency web on `project_tasks` (**00215**), `comms_threads.coordination_item_id` (**00216**), coordination RLS (**00217**, fixed the 42P17 recursion), `resolve_coordination_item` RPC (**00218**), read-model views `coordination_court_summary`/`task_blocked_state` (**00219**), notifications (**00220**).

### Proposal / signature RPCs
- `sign_proposal` (**00210**) — client-authorized, one-tx settle→accept→auto-activate (`p_auto_activate` default true), + `request_proposal_change`.
- `record_offline_signature` (**00254**, R92) — designer-authorized sibling; consent `'paper'` (CHECK widened), signable on `sent`/`viewed`/`expired` (no expiry box), event `signed_offline`, delegates to `activate_proposal_as_project` (00199 lineage), returns activated project id.
- Proposal nudge: `last_nudged_at`/`nudge_count` + `nudge_proposal` RPC (**00231**).
- Folio on proposal-stage docs: `project_documents.proposal_id` anchor + client read leg (**00252**, R85).

### Lifecycle RPCs
- `open_project_direct` (**00237**, R79) — manual no-proposal project; nullable `p_client_id`, ensures a `designer_clients` row, idempotent on supplied id.
- `close_project` (**00238**, R80) — adds `projects.closure_checklist`/`portfolio_snapshot`, flips status→completed in one tx.
- `apply_scope_change` (**00253**) — CREATE OR REPLACE of the 00084 fn with an added ownership guard (fixes an IDOR).

### Invoicing (reused by Track 8, not new)
`invoices`/`invoice_line_items`/`invoice_payments`/`invoice_counters` + `issue_invoice`/`record_invoice_payment`/`void_invoice` all from **00178**; FF&E invoice lines **00187**.

### Discovery
`client_discovery` (**00224**, `begin_direction_from_discovery`), `set_document_client` (**00225**).

### RLS notes
- Coordination RLS was fixed under **00217** after 00212's `project_parties` policy caused a self-`EXISTS` infinite-recursion (42P17) that broke every embed (court bar/groups empty). The fix narrowed the check to `profile_id=auth.uid()` with a cross-party read via a `SECURITY DEFINER` helper.
- `apply_scope_change` (00253) is a `CREATE OR REPLACE` of the pre-existing 00084 function specifically to add an ownership guard — closing an IDOR where scope changes could be applied without an ownership check.
- Views in the derivation stack (`document_state`, `margin_items`, `people_directory`, `coordination_court_summary`, `task_blocked_state`) are declared `security_invoker`, meaning they inherit the RLS of the querying user rather than the view owner — consistent with the "no new table, no new privilege surface" invariant.

**Document-native migration range: 00191–00254** (00239–00251 are a separate Aesthete workstream interleaved in the numbering).

## 5. API / Edge / Service Surface

Edge functions in `supabase/functions/` used by the Document (39 total in repo):
- **`proposal-nudge`** — the R71 client nudge on the watch view (migration 00231).
- **`proposal-send`**, **`proposal-sign-confirmation`** — send a proposal; email the client on e-sign (NOT fired for `record_offline_signature`/paper).
- **`invoice-reminders`** — the Accounts receivables "Send reminder" / chase (Track 8; local edge_runtime must be up or it returns non-2xx).
- **`invoice-send`** — issue & send an invoice.
- **`po-send`** — PO PDF + vendor email (Orders book / procurement).
- **`decision-reminders`**, **`decision-resolved-notify`** — decision/coordination nudges + resolve notifications.
- **`comms-notification-dispatch`**, **`notification-dispatch`** — margin/thread + generic notification fan-out.
- **`lead-expiration-check`** — lead response-deadline cron input (Desk triage).

RPC surface (Postgres functions, called from `@patina/supabase` hooks): `resolve_coordination_item`, `submit_coordination_revision`, `sign_proposal`, `request_proposal_change`, `nudge_proposal`, `record_offline_signature`, `open_project_direct`, `close_project`, `apply_scope_change` (guarded), `begin_direction_from_discovery`, `set_document_client`, `issue_invoice`/`record_invoice_payment`/`void_invoice`, `activate_proposal_as_project`.

No NestJS endpoints and no Next.js API routes are specific to the Document — it reads views/RPCs directly via the Supabase client (per repo data-access convention). This is consistent with the CLAUDE.md convention: Supabase-first data access via `@patina/supabase` hooks, no bespoke backend for this feature area.

## 6. UI Surfaces

### Designer portal — the Document route group `(document)/`
- **`/desk`** — the Desk: needs-your-hand folders + in-motion chips + triage bar + People reconnect need-line.
- **`/doc/[id]`** — the single-focus document (Brief→Care); margins, coordination band, FF&E, letterhead, colophon, watch view.
- **`/drafting/[proposalId]`** — the Drafting Room (8 facets, live client's-copy mirror, send/revise).
- **`/compose`** — the Composing Page.
- **`/library`** + **`/library/[id]`** — the Library Room and the Piece (view/edit one product; layer chips, retail/trade, teach/promote, import/validate/search).
- **`/people`** — the People Room (Directory · Threads · Nurture · Reviews · Portfolio · Outreach; role-adaptive Person Profile with derived Relationship Journey + Style DNA).
- **`/help`** (`(document-help)` group) — the re-homed paper Help Center (R89).

### Overlays (sheets, never leave the document)
Studio Drawer (Orders/Hours/Accounts sheets + Library/People/Drafting rooms), ⌘K CommandBar, AccountSheet, InvoiceOverlays (folio + composer), CaptureLeadSheet, OpenProjectSheet, AmendmentSheet, HouseholdSheet, SendSheet/ReviseSheet/DocSheet, MarkSignedSheet, PostSheet, ScanViewerSheet, PaperFolioSheet, DiscoveryCallSheet.

### Mobile
`mobile/**` provides the <980px physics (D13) — MobileShell/Bar/Sheets/margin-chips; the phone was L4 device-walked for the Rooms/Library/Composing surfaces.

### Client-facing
- Designer-side preview: `components/document/client-mirror.tsx` (the "client's copy" grammar).
- Actual client portal (`apps/client-portal/`) mirrors coordination/decisions/proposals separately (decision-card-client branch, coordination-banner).

### Admin / native
No admin-portal or iOS/Chrome-extension surface for the Document — it is designer-portal web only.

## 7. Reconciliation & Gaps

⚠ **Spec is stale vs code.** `the-document-spec-v1.6.md` (2026-06-17) is the newest spec but only covers through R60/§20 and migrations 00191–00221. The actual code + `DECISIONS.md` run through **R92 / I48** and migrations **00254**. The **spec v1.7 fold (R61–R92 + I43) is explicitly owed** — until it lands, DECISIONS.md + the-document-IMPLEMENTATION-INDEX.md + gap-matrix-v2 are the real canon, NOT v1.6.

⚠ **R21 dissolve is NOT executed** despite spec §12/§16 treating it as the terminal step. `apps/designer-portal/next.config.js` `redirects()` still maps bare zone routes to the OLD zones (`/clients`→`/portal/clients`, `/vendors`→`/portal/vendors`, etc.), the `(portal)/portal/*` zones + `/portal/help` still exist and function, `DocumentGate` still redirects OFF to `/portal`, and there is no app-wide shadow ban. The dissolve's Stage-3 (old-URL redirects → Document surfaces, zone removal, Inbox retirement, DocumentGate retirement) is unbuilt.

⚠ **`the-document-parity-backlog-2026-07.md` (2026-07-01) is a stale snapshot.** It lists P0 rows BIL-02/03/04/05/09 (record payment, invoice line kinds, unbilled-time pull-through, FF&E invoicing, invoice detail/acts) and PRC-03 (add a vendor) as OPEN, with Waves 1–2 as planned/in-flight. As-built, git history shows **Wave 1 (Tracks 7/8/9/11-M) and Wave 2 (R82/85/86/87/88/89/90) merged to main** — those P0s are closed (invoice-folio + composer + `useRecordPayment` exist). The backlog is a pre-build snapshot and should not be read as current state.

⚠ **`the-document-IMPLEMENTATION-INDEX.md` undercounts the migration tip.** It says "the Document's own new numbers are 00252 + 00253" and "Prod is at 00229 … owes 00230–00253." In fact **00254** (record_offline_signature, R92) also landed after the index snapshot, and commit `cb15fb37` claims "prod deploy tier 1 (migrations 00230-00254) done + verified" — so the DB tier is likely now caught up to 00254, contradicting the index's 00229.

⚠ **MEMORY.md drift on merge status.** MEMORY.md states the offline-signature work (`5007b3d3`, R92) is "branch … pushed NOT merged, not on prod." `git merge-base --is-ancestor 5007b3d3 HEAD` confirms it **is merged to main**. (Prod app-tier deploy is still pending a human gate, so the "not on prod" half holds.)

⚠ **Track 8 money completion carried no new migration**, though spec/backlog framing implies schema work. The as-built is a surface-only build reusing `00178_invoices_v1.sql` (`issue_invoice`/`record_invoice_payment`/`void_invoice`) + the `00187` FF&E coverage bridge via `use-invoices.ts`.

⚠ **Proposal "opened twice" hesitation copy (spec §14.16 / R45) is not backable in code** — only first-open `proposals.viewed_at` is tracked (00230 added open *counts*, but the "twice" semantics shipped as "Opened {date}").

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Execute the R21 dissolve Stage 3: redirect old zone URLs to Document surfaces, remove the `(portal)` zone routes + `/portal/help`, retire the Inbox, retire `DocumentGate`, and turn the D4 shadow ban CI-blocking app-wide. | P0 |
| Complete the prod deploy: confirm migrations 00230–00254 applied, deploy the Document Wave 1/2 app tier + the `proposal-nudge` edge fn, and run the owed prod live-walk (R92 mark-signed included). | P0 |
| Write the spec v1.7 fold (R61–R92 + I43) so a single spec is canonical again instead of DECISIONS.md + index + gap matrix. | P1 |
| Resolve the Leah-facing provisional constants: Drafting Room facet order, `DRAFTING_UNTOUCHED_CHIP_DAYS`, sign→project two-step, People Room nurture thresholds, and the D2 no-toast error grammar. | P1 |
| Finish Via Patina rate finals + the Aesthete-fold Accounts/Earnings rendering (§14.15). | P2 |
| Flip GC/vendor tracked parties to real logins (`project_parties.profile_id`) + the punch↔PO closeout link and multi-hop cycle detection when webs need it; add semantic people-search. | P2 |
| Clear the P2 parity long tail (ledger filters, decision delete, collections, teaching notes, digest/unsubscribe, bulk archive, lead history). | P2 |

## 9. Status & Deploy

**On main (HEAD `ca3afe34`):** the full Document program is merged — Slices 0–6, THE FLIP, Dissolve Tracks 1–3, Track 4 (proposal authoring), Track 5 (coordination), the Decision Composer, the People Room, Track 6 (funnel), R67–R72 (Account sheet/household/Direction band/quiet timer/the Piece/watch+nudge/light Desk), **Wave 1** (Track 7 lifecycle, Track 8 money, Track 9 makers, Track 11-M procurement eight), **Wave 2** (R82 the Post, R85/R86 proposal depth, R87 decision edges, R88 Library, R89 help, R90 scan), and R92 offline signature. Document-native migrations **00191–00254** are on main; funnel-repair findings (F1–F10) all fixed + re-walked green (I45).

**On prod:** historically at migration 00229. Commit `cb15fb37` reports "prod deploy tier 1 (migrations 00230–00254) done + verified" (DB tier caught up), with the **app tier handed back to a human deploy gate**. The `proposal-nudge` edge fn deploy was flagged owed (LAN-access blocked as of 2026-07-01), and the R92 DECISIONS entry still reads "Not on prod; live Chrome walk owed."

Net: **DB migrations for the Document appear deployed to prod, but the Document Wave 1/2 app build + edge-fn catch-up + prod live-walk are the outstanding deploy work.** The R21 dissolve is a code prerequisite that must precede final zone removal in prod.

## 10. Superseded Sources

This consolidated PRD replaces the following documents:

- `docs/design/the-document/the-document-spec-v1.3.md`
- `docs/design/the-document/the-document-spec-v1.4.md`
- `docs/design/the-document/the-document-spec-v1.5.md`
- `docs/design/the-document/the-document-spec-v1.6.md`
- `docs/design/the-document/the-document-parity-map.md`
- `docs/product/portal-vs-desk-feature-gap-matrix.md`
- `docs/design/the-document/portal-vs-desk-feature-gap-matrix.md`
- `docs/design/the-document/the-document-parity-backlog-2026-07.md`
- `docs/design/the-document/the-document-needs-ruling-2026-07.md`
- `docs/design/the-document/the-document-reaudit-walk-2026-07.md`
- `docs/design/the-document/the-document-track3-audit.md`
- `docs/design/the-document/the-document-track3-L4-device-check.md`
- `docs/design/the-document/the-document-track3-package.md`
- `docs/design/the-document/the-document-track3-fixes-package.md`
- `docs/design/the-document/the-document-track6-package.md`
- `docs/design/the-document/track6-funnel-addendum.md`
- `docs/design/the-document/the-document-proposal-authoring-package.md`
- `docs/design/the-document/the-document-decision-composer-package.md`

**Retained (not superseded)** — these remain the operating references alongside this PRD:
- `docs/design/the-document/DECISIONS.md`
- `docs/design/the-document/CLAUDE.md`
- `apps/designer-portal/CLAUDE.md`
- `docs/design/the-document/the-document-IMPLEMENTATION-INDEX.md`
- `docs/design/the-document/CODEBASE-MAP.md`
- `docs/product/portal-vs-desk-feature-gap-matrix-v2.md`
- `docs/design/the-document/patina-the-document-prototype-v4.html`
- `docs/design/the-document/patina-the-document-mobile-d3-v1.html`
- `docs/design/the-document/patina-strata-mark-progress-system.html`
- `docs/design/the-document/patina-project-coordination-prototype.html`
- `docs/design/the-document/patina-proposal-authoring-prototype.html`
- `docs/design/the-document/patina-library-room-prototype.html`
- `docs/design/the-document/patina-composing-page-prototype.html`
- `docs/design/the-document/people/patina-people-room-prototype.html`
- `docs/design/the-document/patina-decision-system-prototype.html`
