# Designer Portal — MVP Additions Spec

**Version:** 1.0
**Last Updated:** April 2026
**Status:** MVP Additions — Pilot Phase
**Scope:** Project management views added to existing Designer Portal
**Target Users:** Independent designers (Leah persona), small design studios (Leah + Andrea persona)
**Platform:** Next.js 15 · React 18 · TypeScript · Supabase · Same stack as existing portal

---

## Context

The existing Designer Portal handles **leads, proposals, products, the Aesthete Engine, clients, and earnings**. This MVP adds the project management layer — what designers need to actually run projects after a proposal is signed. Existing screens remain untouched; these are additive.

---

## 1. Project List (extends existing Pipeline)

| Feature | Functionality |
|---------|---------------|
| **Stage tabs** | Existing tabs (Leads, Proposals) extended with: Active, Completed, On Hold. Live counts per tab. |
| **List view** | Table with columns: Project, Client, Phase, Progress, Budget. Sortable. |
| **Grid view** | Card alternate with hero image, progress, key metric. User preference persists. |
| **Project filters** | By designer (for multi-designer studios), by client, by date range, by budget range, by on-track status. |
| **Search** | Filter by project name, client name, address. |
| **Bulk actions** | Multi-select for: archive, change lead designer, export financial summary, generate combined report. |
| **New project entry points** | "+ New Project" button in subnav · "Convert to Project" button on signed proposals · API import from external CRM. |
| **Status indicators** | Color-coded: Sage (on-track), Clay (active), Gold (warning), Terracotta (at-risk), Pearl (future). |
| **Click action** | Opens Project Detail screen for that project. |

---

## 2. Project Activation Wizard

| Step | Functionality |
|------|---------------|
| **Trigger** | Designer clicks "Activate Project" on a signed proposal, or "+ New Project" with manual entry. |
| **Step 1 · Confirm Scope** | Pre-filled from signed proposal: rooms, FF&E line items, design fee, payment milestones, exclusions. Designer reviews and confirms or edits. Auto-creates room cards and FF&E items at "Specified" stage. |
| **Step 2 · Set Schedule** | Set kickoff date. System calculates phase start/end dates from proposal duration. Designer can adjust per phase. Approval gates between phases auto-attach. Add custom milestones. |
| **Step 3 · Add Vendors** | Optional. Pre-assign vendors to FF&E items where designer has standing relationships. Other items assigned during procurement. PO numbers auto-generated. |
| **Activation actions** | Generates kickoff invoice. Sends client welcome email. Creates project workspace. Assigns lead designer. Project appears in Active list. |
| **Save & resume** | Auto-save on every field change. Drafts persist 30 days. Listed in Pipeline with "Activation Incomplete" status. |
| **Skip option** | Designer can skip Step 3 and add vendors later from Project Detail or FF&E screen. |
| **Time to complete** | Target: 15 minutes for solo designer with signed proposal in hand. |

---

## 3. Project Detail (12-Zone Single Scroll)

| Zone | Functionality |
|------|---------------|
| **1. Header** | Project name, address, client, lead designer, support designers, current phase indicator with 6-dot timeline (Initiation → Design Dev → Procurement → Production → Installation → Close-out). |
| **2. Metrics row** | Progress %, budget total, committed amount, FF&E ordered (X/Y), open decisions count, hours logged. |
| **3. Room scope** | Cards per room: name, dimensions, FF&E item count, budget allocation, progress bar. Add/remove rooms via Scope Change Authorization. |
| **4. Phase tasks** | Active phase task list. Tasks have status (done/active/blocked), assigned designer, due date. Approval gates as starred badges. Collapsed completed phases. |
| **5. FF&E schedule** | Inline view of FF&E pipeline (linked to full Screen 04). Shows items in current phase with status and ETA. |
| **6. Financials** | 4-column inline summary (Budget/Committed/Actual/Variance) by category. Designer earnings panel visible only to lead designer. Linked to full Screen 05. |
| **7. Decisions** | Open decisions list with deadlines, blocking impact. Linked to full Screen 06. |
| **8. Documents** | Project documents: signed proposal, contract, change orders, design files, photos, invoices. Drag-to-upload. Version-controlled. |
| **9. Time tracking** | Hours logged per phase as progress bars. Total hours, effective rate. Time-by-designer breakdown for multi-designer studios. |
| **10. Activity feed** | Reverse-chronological event log: client actions, designer updates, vendor confirmations, system events. |
| **11. Communications** | Recent client/vendor messages relevant to this project. Inline reply. Linked to full Messages panel. |
| **12. Project meta** | Created date, kickoff date, expected completion, designer team assignments, vendor list, audit log link. |
| **Edit Mode toggle** | Default read-only. "Edit Mode" pill enables inline editing. Auto-save on field blur. Conflict resolution via etag for concurrent editors. |
| **Client View toggle** | Same project, filtered to client visibility tier set on activation. Designer earnings, vendor costs, internal notes hidden. |
| **Export** | One-click PDF export. Options: Full document, Client view, Financial summary. Branded with studio logo. |

---

## 4. FF&E Procurement Pipeline

| Feature | Functionality |
|---------|---------------|
| **8-stage pipeline** | Specified → Quoted → Approved → Ordered → Production → Shipped → Delivered → Installed. |
| **Per-item view** | Item name, vendor, PO #, qty, unit cost, total cost, current stage, ETA, room, last update. |
| **Filters** | By room, vendor, status/stage, FF&E type (Fixed/Allowance/TBD), price range. |
| **Search** | Full-text search across item names, vendor names, PO numbers. |
| **Item detail** | Click any item to see full procurement history: quotes received, approval timestamps, PO document, ship tracking, photos at each stage. |
| **PO management** | Generate PO from approved item. PO PDF includes studio branding. Auto-emails to vendor. Tracks vendor confirmation. |
| **Vendor assignment** | Drag-drop or dropdown to assign vendor. Pulls from designer's vendor directory. |
| **Quote tracking** | Multiple quotes per item supported. Designer marks selected quote and reason. |
| **Status updates** | Vendor can update stage/ETA via Vendor Portal access. Designer can override. Auto-notification to client at: Ordered, Shipped, Delivered. |
| **Blocked indicator** | Items blocked by pending decisions show Terracotta status with link to the blocking decision. |
| **Bulk actions** | Multi-select for: bulk approve, bulk PO generation, bulk export, bulk reassign vendor. |
| **Client visibility** | Client sees: item name, room, status, ETA. Hides: cost, vendor, internal notes (unless visibility tier permits). |

---

## 5. Project Financials

| Feature | Functionality |
|---------|---------------|
| **4-column table** | Budget vs. Committed vs. Actual vs. Variance per category. |
| **Categories** | Design Fee, Room-by-room FF&E, Delivery & Shipping, Installation, Contingency, Custom categories. |
| **Drill-down** | Click any category to see line-item breakdown contributing to the figures. |
| **Variance calculation** | Auto-calculated. Color-coded: Sage (under budget), Clay (within 5%), Gold (within 10%), Terracotta (over 10%). |
| **Variance reasons** | Optional tag per variance: "Sourcing in progress", "Scope change", "Substitution", "Volume discount". |
| **Designer earnings panel** | Visible only to lead designer. Shows design fee + product commissions + estimated total earnings. Real-time as POs are issued. |
| **Payment milestones** | Pulled from signed proposal. Each milestone shows: amount, trigger condition, status (pending/invoiced/paid/overdue), invoice PDF link. |
| **Invoice generation** | Trigger an invoice from any milestone. Pre-fills from project data. Editable before send. PDF with studio branding. |
| **Payment tracking** | Manual entry of received payments. Optional Stripe Connect integration (Phase 2). |
| **Cost allocation** | Each FF&E item, each PO, each manual expense flows into the appropriate category. |
| **Export** | XLSX export with full line-item detail. PDF summary for client. CSV for accounting software import. |
| **Client view** | Client sees: Budget, Actual, Variance only. No "Committed" column. No designer earnings panel. |

---

## 6. Decisions Workflow

| Feature | Functionality |
|---------|---------------|
| **Decision types** | Material (fabric, finish, stone, hardware), Color (paint, stain), Layout (placement, configuration), Substitution (alternative needed), Approval (phase gate sign-off). |
| **Decision card** | Title, description with context photos, 2–4 visual options with cost/lead-time differences, designer recommendation (optional), deadline date, blocking impact ("blocks 3 tasks"). |
| **Options builder** | Designer adds 2–4 options per decision. Each has photo, name, cost delta, lead-time delta, notes. Drag-drop reorder. |
| **Designer recommendation** | Optional. Designer marks one option as "recommended" with reason. Displayed prominently to client. |
| **Deadline & countdown** | Set deadline date. Auto-countdown indicator. Color shifts as deadline approaches: Sage → Gold → Terracotta. |
| **Blocking impact** | Tag downstream tasks affected by this decision. Visible to client to communicate urgency. |
| **Client interaction** | Client receives notification. Reviews options on web or mobile. Selects + signs decision. Can ask questions inline. |
| **Reminder system** | Auto-sends reminder to client 48hr before deadline if no decision. Escalates to phone/SMS at deadline if missed. |
| **Decision feed-through** | On selection, system auto-updates affected FF&E item, releases blocked tasks, notifies vendors if applicable. |
| **Decision history** | Per project, full log of all decisions, options presented, who decided, when, with timestamp signatures. |
| **Designer override** | Designer can mark decision on client's behalf with explicit consent log (e.g., phone call decision). |

---

## 7. Change Orders (Scope Change Authorization)

| Feature | Functionality |
|---------|---------------|
| **Change order list** | All COs for a project. Status, dollar impact, schedule impact, requestor, date. |
| **CO numbering** | Auto-generated SCA-YYYY-NNN. Per-project sequential. |
| **CO detail view** | Original specification, requested change, auto-generated impact assessment (cost, lead time, schedule, affected tasks), new project total. |
| **Impact engine** | Auto-calculates: cost from FF&E catalog, lead time from vendor data, schedule impact from dependency graph, affected tasks from scope mapping. |
| **Designer recommendation** | PM-style field for designer to add context, recommend approve/alternative/reject. Voice-to-text supported. |
| **Approval chain** | Multi-step: Client request → Designer review → Client signature. Visible as progress indicator. For multi-designer studios, optional studio owner approval for COs over a threshold. |
| **Digital signatures** | Embedded e-sign flow. Signed PDF stored in project Documents. Audit trail with IP, timestamp. |
| **Auto-update on approval** | Master schedule updates, FF&E schedule updates, financials update, affected vendors notified. Original scope archived for reference. |
| **Client-initiated CO** | Client can request a change from their portal view. Triggers full CO flow with designer review. |
| **Designer-initiated CO** | Designer can initiate a CO when scope changes are needed (e.g., out-of-stock substitution). Sends to client for approval. |
| **CO templates** | Common change types saved as templates (upgrade material, add scope item, substitute product). Pre-fills standard fields. |

---

## 8. Team Collaboration (Multi-Designer Support)

| Feature | Functionality |
|---------|---------------|
| **Studio entity** | Studio is the organizational unit. Each studio has owner(s), designers, support staff. |
| **Role types** | Studio Owner, Lead Designer, Support Designer, Vendor/Supplier (external), Client (read-only), Bookkeeper (read-only financials). |
| **Project assignment** | Each project has 1 lead designer (required) + 0–N support designers. Roles can differ per project — Andrea leads Olsen, supports Whitfield. |
| **Permission matrix** | Lead Designer: full edit on assigned projects. Support Designer: edit tasks/hours/photos, no financial edit, no CO sign. Owner: cascade access. |
| **Project handoff** | Reassign lead designer. Audit log records change. New lead notified. Old lead retains access for 30 days. |
| **Activity attribution** | All edits logged with designer name. Project Activity feed shows who did what. |
| **Time tracking by designer** | Hours logged per designer per project. Aggregated across team for project total. |
| **Vendor portal access** | External users (vendors) get scoped access to their assigned POs only. Cannot see project totals or other vendors. |
| **Client visibility tier** | Set per project on activation. Three tiers: Full (sees daily progress), Milestone (sees phase updates), Curated (designer publishes specific updates). |
| **Bookkeeper access** | Read-only across all projects' financials. Cannot modify project data. Exports for tax/reconciliation. |
| **Notification routing** | Per-role notification rules. Lead designer gets all client communication; support designer gets only their task assignments. |
| **Audit log** | Full history of role changes, project assignments, CO signatures, financial edits. Searchable. Exportable. |

---

## 9. Cross-Cutting Updates to Existing Screens

| Existing Screen | Addition |
|-----------------|----------|
| **Today Dashboard** | Active projects card replaces "leads only" view. Decisions overdue surface here. Project deliveries today highlighted. |
| **Pipeline (existing)** | Tabs extended: Active, Completed, On Hold added after Proposals. |
| **Clients** | Client profile shows their active and past projects. Click to navigate to Project Detail. |
| **Communications** | Threads can be associated with a project. Project Detail Zone 11 surfaces project-relevant threads. |
| **Search (⌘K)** | Searchable scope expanded to: projects, FF&E items, change orders, decisions, vendors. |
| **Notifications** | New event types: project_activated, decision_overdue, ff_e_status_change, change_order_signed, payment_received, vendor_eta_update. |
| **Profile / Earnings** | Earnings dashboard now reflects project-level commissions in addition to lead/proposal earnings. |

---

## 10. Data Model Additions

### projects
| Field | Type | Required |
|-------|------|----------|
| id | uuid | YES |
| studio_id | uuid · fk | YES |
| name | varchar(255) | YES |
| client_id | uuid · fk | YES |
| lead_designer_id | uuid · fk | YES |
| signed_proposal_id | uuid · fk | opt |
| current_phase | enum (1–6) | YES |
| status | enum (active/completed/on_hold) | YES |
| budget_total | decimal(12,2) | YES |
| kickoff_date | date | YES |
| expected_completion_date | date | YES |
| client_visibility_tier | enum (full/milestone/curated) | YES |
| created_at, updated_at | timestamp | YES |

### ffe_items
| Field | Type | Required |
|-------|------|----------|
| id | uuid | YES |
| project_id | uuid · fk | YES |
| room_id | uuid · fk | YES |
| name | varchar(500) | YES |
| ffe_type | enum (fixed/allowance/tbd) | YES |
| stage | enum (specified/quoted/approved/ordered/production/shipped/delivered/installed) | YES |
| vendor_id | uuid · fk | opt |
| po_number | varchar(50) | opt |
| qty | integer | YES |
| unit_cost | decimal(10,2) | YES |
| eta | date | opt |
| blocked_by_decision_id | uuid · fk | opt |

### change_orders
| Field | Type | Required |
|-------|------|----------|
| id | uuid | YES |
| project_id | uuid · fk | YES |
| co_number | varchar(50) | YES |
| requested_by | uuid · fk | YES |
| original_spec | jsonb | YES |
| requested_change | jsonb | YES |
| cost_impact | decimal(10,2) | YES |
| schedule_impact_days | integer | YES |
| status | enum (draft/awaiting_review/awaiting_signature/approved/rejected) | YES |
| signed_pdf_url | text | opt |

### decisions
| Field | Type | Required |
|-------|------|----------|
| id | uuid | YES |
| project_id | uuid · fk | YES |
| decision_type | enum (material/color/layout/substitution/approval) | YES |
| title | varchar(255) | YES |
| description | text | opt |
| options | jsonb | YES |
| recommended_option_idx | integer | opt |
| deadline | date | YES |
| status | enum (open/decided/overdue) | YES |
| selected_option_idx | integer | opt |
| decided_at | timestamp | opt |

### project_team_members
| Field | Type | Required |
|-------|------|----------|
| id | uuid | YES |
| project_id | uuid · fk | YES |
| user_id | uuid · fk | YES |
| role | enum (lead_designer/support_designer/vendor/client/bookkeeper) | YES |
| permissions | jsonb | YES |
| assigned_at | timestamp | YES |

---

## 11. API Endpoints (New)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/projects/activate-from-proposal` | Convert signed proposal to project. |
| `POST /api/v1/projects` | Create project manually. |
| `GET /api/v1/projects` | List with filters (status, designer, client). |
| `GET /api/v1/projects/{id}/full` | Project Detail with all 12 zones. |
| `PATCH /api/v1/projects/{id}` | Edit project (with conflict resolution). |
| `GET /api/v1/projects/{id}/ffe` | FF&E pipeline data. |
| `PATCH /api/v1/ffe-items/{id}/stage` | Update item stage with vendor notification. |
| `POST /api/v1/po/generate` | Generate PO PDF and send to vendor. |
| `GET /api/v1/projects/{id}/financials` | 4-column financial summary. |
| `POST /api/v1/decisions` | Create decision. |
| `POST /api/v1/decisions/{id}/decide` | Client selects option. |
| `POST /api/v1/change-orders` | Create CO. |
| `POST /api/v1/change-orders/{id}/approve` | Approve and cascade. |
| `POST /api/v1/projects/{id}/team` | Assign team member to project. |
| `PATCH /api/v1/projects/{id}/visibility` | Change client visibility tier. |
| `POST /api/v1/projects/{id}/export` | Export PDF (full / client / financials). |

---

## 12. Build Plan

| Sprint | Duration | Scope |
|--------|----------|-------|
| **Sprint 1** | Weeks 1–4 | Project List · Project Activation Wizard · Project Detail (read-only) · Database schema · Designer Portal proposal-to-project conversion. |
| **Sprint 2** | Weeks 5–8 | FF&E Procurement with 8-stage pipeline · Project Financials with 4-column tracker · Decisions Workflow with reminder system · Edit Mode unlock on Project Detail · PO generation. |
| **Sprint 3** | Weeks 9–12 | Change Orders with approval chain · Team Collaboration with multi-designer permissions · Vendor portal access · Client-view filtering · Audit logs · Mobile parity for site updates. |

---

## 13. Out of Scope for MVP (Documented for V2)

- Manufacturer integration with real-time inventory feeds (manual entry only in MVP)
- Stripe Connect for automated payment collection (manual invoicing in MVP)
- AR-to-reality post-installation comparison
- Custom phase templates (uses 6 fixed phases in MVP)
- Subcontractor coordination (separate from FF&E vendors — handled by GC tracker)
- White-label client portal branding per project (studio-level branding only)
- Multi-currency support (USD only in MVP)
- Calendar integration (Google/Outlook) for milestones
- Email integration for project communications (uses in-portal messaging only)

---

## 14. MVP Success Criteria

| Metric | Target |
|--------|--------|
| **Pilot scope** | Middlewest Studio + 2 additional studios |
| **Active projects in pilot** | 8–12 simultaneously |
| **Duration** | 3 months |
| **Project setup time (signed proposal → activated)** | Under 20 minutes average |
| **% of FF&E items tracked through full pipeline** | 90%+ |
| **Change order approval time** | Under 5 days average |
| **Client decision response time** | Under 4 days average |
| **Designer time saved on admin** | 30% reduction vs. previous tools |
| **Studios with multi-designer collaboration** | At least 1 of 3 pilots |
| **Portal NPS from pilot designers** | 50+ |
