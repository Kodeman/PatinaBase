---
Status: Draft
Owner: Kody
Last Updated: 2026-07-07
Type: Competitive research → feature spec input
Related: programa-teardown-patina-gap-map.html (deck) · Designer Portal · Capture pipeline (T-01/T-03/T-05)
Routing: Strata--1-Projects--Patina/Research/ (promote sections 6–8 into Strata/PRDs/ as they're scoped)
---

> **Correction 2026-07-07:** §4/§5 below were audited against the codebase at HEAD; rows marked ✎ were corrected — Patina's scope builder, per-item trade/markup/client financials (since migration 00014), mood boards (00179 canvas), PO lifecycle w/ PDF+email, invoicing+Stripe, and time tracking all EXIST. See the Schedule & Boards program plan.

**Purpose.** First-hand feature inventory of Programa (programa.design), gathered from the marketing site and a live trial workspace on 2026-07-07, followed by a capability-by-capability gap analysis against Patina's current state and a sequenced development plan to reach parity where it matters and pull ahead where only Patina can.

# Programa Feature Spec & Patina Gap Plan

---

## 1. Scope & method

- **Marketing site:** features overview, Schedules & Specification page, pricing, and the in-app changelog (release notes back through Q2 2026, including the published Q3 2026 roadmap).
- **Live trial** (app.programa.design): Pulse home, Demo Project (39-item schedule), product detail panel (all tabs), schedule Financial view, Share dialog, quote-request flow, PO builder, task board + task detail, Meetings, Shared Files, Invoices setup, Presentations editor, Pinboard, Studio views, Time Tracking, Product Library, Address Book, Image Library, Settings (Studio, Integrations, Tax, Invoices, Billing).
- Everything below marked **[observed]** was seen directly in the app; **[marketing]** comes from their site copy; **[roadmap]** from their published release notes/roadmap.

## 2. Programa positioning & pricing

- Single **Pro** plan: **$71/mo** (first seat) + **$31/mo per additional seat**, all features, unlimited projects, 7-day trial, no card required. [observed on pricing page]
- Positioning: "the future of studio operations" for A&D studios — specify, communicate, get paid. The Schedule is the hub; everything else attaches to it.
- Audience segmentation on site: solo designers / small studios / large teams.

## 3. Full feature inventory

### 3.1 Workspace shell [observed]

- Sidebar: **Pulse · Projects · Presentations · Studio (Studio Management, Time Tracking, To-Do List) · Financials (Invoices, Purchase Orders) · Libraries (Product Library, Address Book, Image Library)**.
- Global **Smart Search** (⌘K) across products, projects, schedules, tasks, contacts; category filters; recent items; keyboard navigation; tolerant of imprecise names. [marketing + observed]
- **Quick Meeting** launcher in the shell; global **Start timer** persistent in the top bar on every screen.
- Guides, What's New (changelog), in-app support chat, referral program.

### 3.2 Pulse (home / command center) [observed]

- Personalized greeting + date; **Getting Started** checklist (create schedule → add product from URL → edit schedule) with completion tracking.
- **Today's Focus:** machine-generated, time-saving recommendations based on projects and activity, with thumbs up/down feedback on usefulness.
- Release notes call the project-level equivalent a "command center" (Project Hub). Alternative Product Recommendations (see 3.10) surface here.

### 3.3 Projects [observed]

- Project cards with cover art, status (Active/Archived), last-edited. Search, sort, create. **Two seeded templates** ship with trial: "Interior Design & Arch." and "Interior Decor & Styling" — template-driven project setup.
- **Project Overview dashboard:** location, status chip, project-type tag, date range; stat tiles — active tasks (+ overdue callout), pending approvals (+ rejected), time tracked, **total schedule value**, total invoices; team & client avatars; recent files strip.
- **Project nav:** Overview · Files · Meetings (Beta) · Project Management · Invoices · Purchase Orders · Shared Files · Settings.

### 3.4 Files (per project) [observed]

- Flat file hub listing every artifact: **name, type, shared-with, status, last updated**.
- **Create file** types: **Schedule · Presentation · Pinboard · Canva Share · Import Files · Import Products.** (Canva as a first-class file type.)

### 3.5 Schedules (the core) [observed + marketing]

**Structure**
- Sections (rooms or custom: Seating, Tables…) with item counts; collapse/expand; drag-and-drop; bulk actions.
- Per-section add bar: **Add from URL · Product from library · Custom Product · Section.**
- Views over the same data: **Summary** (spec) and **Financial** (money), plus "View section" jump menu; search within schedule; filter and sort.

**Product rows (Summary view)**
- Thumbnail, item type + "See drawings for location" note, **doc code** (CH02, TB01…) with real-time duplicate detection [marketing], product name, brand, W/L/H/D (mm), color, finish, material, qty, **lead time** (dropdown: In Stock, 1-2 wks … 24-26 wks), supplier + assigned person, **status chip**, Details / Quote buttons, per-row ⋯ menu.
- **Item statuses observed:** Internal Review → Client Review → Approved → Ordered (colored chips, per-row dropdown).

**Product detail panel — tabs: Summary · Financial · Procurement · Attachments · Approvals**
- *Summary:* image gallery (multi-image, star/primary, "Inset" flag, remove), name, description, doc code, details, qty, brand, SKU, lead time, product URL (with open-in-new), **linked Supplier contact** (name, person, email; edit/remove — ties to Address Book), specs (H/D/W/L, color, finish, material, product category select, **custom specs**), Notes split into client-facing "Important information" and **internal notes**, **Download PDF** (per-item spec sheet), status control, prev/next item navigation.
- *Financial:* RRP + currency, qty, trade price, trade discount %, markup %, profit, client savings %, client price; computed totals (client price, net profit).
- *Approvals:* per-item approval history; prompt to set status to Client Review to solicit feedback.
- *Attachments:* per-item files.

**Financial view (schedule level)**
- Header: **total client price** and **total profit** (currency-tagged), bulk **Add markup** toggle.
- Per section: total excl. tax. Per row: trade price, qty, cost, markup %, client price, RRP, trade discount %, client savings %, **net profit** (green).

**Getting data in**
- Web Clipper (see 3.6), URL paste, library pull, manual, **Excel/CSV import with "Smart Schedule Importer"** for messy files. [marketing]
- Unlimited custom fields. [marketing]

**Sharing (Share dialog)** [observed]
- **Publish to Client Dashboard** — add client by email; per-share access settings.
- **Publish to Web** — live link with visibility toggles: **show supplier · show brand · show product URL · show pricing · show details.**

**Quotes** [observed]
- **Get quotes / Send Quote Requests:** auto-emails each supplier with project name + address, product info, quantities; each supplier sees **only their own items**, never the whole schedule. Per-row "Quote" buttons (disabled once Ordered).

**Roadmap** [roadmap]
- **Schedules 3.0:** one source of truth per project; organize/filter/share/present flexibly; groundwork for budgets, advanced time billing, cashflow, per-project profitability.

### 3.6 Web Clipper & product ingestion [marketing]

- Browser extension: while on a supplier page, save to a schedule, the Product Library, or both.
- **Smart Fill:** auto-extracts name, pricing, imagery, URLs, description.
- **Add From URL:** paste a supplier link → populated record.
- **Refresh from source:** re-pull product details from the original URL in one click ("products and prices stay current").

### 3.7 Product Library / Image Library / Address Book [observed]

- **Product Library:** studio-wide database; search by brand, supplier, SKU, tag, name [marketing]; add via **Custom Product · From URL · Import from File**; "Add demo products" seeding; add-to-schedule from library.
- **Image Library:** shared image asset store; feeds pinboards.
- **Address Book:** company contacts; **Import** + Create contact; suppliers link to schedule items and receive quotes/POs.

### 3.8 Pinboards (mood boards) [observed + marketing]

- Sections (e.g., Concept, Details, Floorplan, Materials & Finishes); New Section; All/Archived filter.
- Add menu: **Add from my files · Add from Pinterest · Import from Image Library · Import from Product Library · Create new section.**
- Auto-snap layout (no manual arranging); resize/reorder; **Presentation Mode** (client review) vs **Detail Mode** (notes, links, image context) [marketing]; Share.

### 3.9 Presentations [observed + marketing]

- Multi-page canvas editor; zoom; undo/redo; **page-size presets**; per-page Add / **Pin** (pull live products/schedules onto pages); Pins panel.
- Actions: Share, Duplicate presentation, **Copy to…**, **Export as PDF**, Delete.
- Positioned as "your project lives here — now show it off." Marketed as the future of client presentations.

### 3.10 Client Dashboard & approvals [marketing + observed]

- Branded client-facing dashboard per project; clients added by email; link regeneration and instant revocation.
- Per-view visibility control: pricing, suppliers, brands, URLs, product details, feedback.
- **Per-line-item approve / reject / comment with threaded replies**, attached to the product; approval history on the item's Approvals tab; pending approvals roll up to Project Overview.
- **Shared Files:** per-project files/folders surfaced to the client dashboard. [observed]
- **Alternative Product Recommendations** [roadmap, launching]: when a client rejects with a comment, the system analyzes product + comment and proposes an alternatives shortlist (appears in Pulse and the Approvals tab); designer reviews, picks, sends back.

### 3.11 Project Management [observed + marketing]

- Views: **Board · List · Timeline** per project; **Studio Management** = same views across all projects; **To-Do List** personal view.
- Kanban columns: To Do / In Progress / In Review / Done. Tasks tagged with **phases** (Concept Design, Schematic Design, Design Development, Project Admin — or custom).
- Task record: description, comments, status, members, target date, **key-date flag**, phase, **per-task timer (00:00:00)**, labels, attachments (up to 50), subtask counts w/ progress.
- **New Timeline** [roadmap, shipped Jul 2026]: drag a phase and dependents move with it (ripple/re-flow); scenario testing (drag, test, drag back); cross-project timeline to spot clashes.
- Tasks link to products/files; Pulse surfaces overdue tasks and pending approvals. [marketing]

### 3.12 Meetings (Beta) [observed]

- Per project: **record a meeting or upload a transcript from another app**; Programa transcribes and extracts **every decision, action item, and open question.**

### 3.13 Time Tracking [observed + marketing]

- Global timer: start/pause/resume/stop with **automatic smart project assignment**; manual entries; attach to tasks; entry types (meetings, site visits, sourcing, design).
- Views grouped by date/project/person; weekly view; **Export**; convert entries to invoice line items.

### 3.14 Invoicing & Programa Pay [observed + marketing]

- Setup flow: business profile → payments (Programa Pay). Pitch: invoices "get paid 3× sooner" with online payments.
- Invoice lines from **schedule products, tracked time, custom items**; branded, mobile-friendly payment portal (card + bank transfer); chargeback protection, secure processing, dispute management.
- **Integrations: Programa Pay, QuickBooks, Xero** (transactions + attachments sync). [observed on Integrations page]
- Regional availability of new invoicing/Pay recently expanded. [roadmap]

### 3.15 SketchUp Extension (Beta) [roadmap, shipped Jun 2026]

- Product Library browsable **inside SketchUp** (by name, brand, type, material, colour).
- Searches SketchUp 3D Warehouse using saved product data to surface closest model matches; drag-drop into model.
- Any product image usable as a **SketchUp material/swatch** (tile, stone, timber, paint).
- Spec-vs-modeled **sense-check** as projects grow.

### 3.16 Settings [observed]

- My Account (profile, timezone), **Studio** (logo, name, type, location — branding that flows to client-facing surfaces), Team invites, Billing, Invoice settings, Tax, Integrations, Notifications.

### 3.17 Published Q3 2026 roadmap themes [roadmap]

1. **Schedules 3.0** — single source of truth, flexible organize/filter/share/present.
2. **Studio Operations** — financial workflows, project controls, profitability, operational visibility ("does *this project* make money," budgets, cashflow, advanced time billing).
3. **Brands** — designer↔brand workflows: quoting, procurement, supplier collaboration, purchasing. *(Direct move toward Patina's maker-side thesis.)*
4. **Assistance layer** — continuing after Meeting Notes and Smart Search; Alternative Product Recommendations rolling out.

---

## 4. Patina current state (for the diff)

- **Capture pipeline (spec'd, in build):** Chrome extension **T-01**; iOS field-capture app **T-03** (camera-first, offline-first, Action Button/Control Center/Share Sheet/Siri, Live Activity); **Capture Inbox T-05** at plan.patina.cloud (captured-vs-verified split, completeness scoring, keyboard triage + ⌘K, duplicate merge). Capture lifecycle state machine defined.
- **Catalog + expertise layer:** product database with designer annotations, context tags, ratings — the substrate for **Designer-Taught Intelligence** (canonical term; never "AI" in Patina content).
- **Designer Portal:** in active development; Leah is the first daily user. Desk / margin / Ledger / Document interaction model. Feedback layer PRD'd (persistent capture button, four buckets, Noted→Building→Shipped→Archived).
- **Infra:** Supabase/Postgres, pgvector, Coolify deploys, Cloudflare Tunnel; patina.cloud + plan.patina.cloud.
- **Model:** maker-paid commission (~5%) as the primary engine; **free designer tooling as the moat**; vendor + designer pipelines running.
- **Not built (corrected 2026-07-07):** per-line client verdicts + comment threads, tokenized public share links, doc codes + duplicate detection, unlimited custom fields, per-item spec-sheet PDFs, per-field client visibility toggles, in-portal add-from-URL + refresh-from-source, RFQ *email delivery* to off-network suppliers, the paged presentations editor, an address-book contacts UI, accounting sync (Xero/QB), and CAD integration. **Everything else previously listed here exists in some form** — the scope/spec builder (proposals: scope rooms · per-room line items · sections · phases · exclusions · palettes · boards), per-item trade/markup/client financials (`proposal_items` since 00014; FF&E dual-pricing 00185), mood boards (00179 canvas + 00180 project carry + 00260 clone carry), the PO lifecycle with PDF + email (00148 + 00184–00190, `po-send`), invoicing + Stripe + AR (00178 + critical-gaps 00177–00182), and time tracking (00177–00182).

## 5. Gap matrix

Dispositions: **LEAD** (Patina ahead — extend) · **P0** (parity-critical, build now) · **P1** (build next) · **P2** (later/light) · **SKIP** (deliberately not chased) · **LEAPFROG** (build the better version, not the same one).

| # | Capability | Programa | Patina | Disposition |
|---|---|---|---|---|
| 1 | Browser capture | Clipper + Smart Fill | T-01, richer recognized-data states | **LEAD** — add URL paste-in + refresh-from-source (cheap, high-value) |
| 2 | Mobile/field capture | None | T-03 spec complete | **LEAD** — ship it; it's uncontested |
| 3 | Verification pipeline | None | T-05 captured→verified | **LEAD** — core differentiator, finish it |
| 4 | Product library | Shipped; search by brand/supplier/SKU/tag; custom/URL/file-import | Catalog + expertise layer in build | **P0** — finish; expertise layer is the surplus |
| 5 | Image library | Shipped | None | **P2** — fold into catalog assets |
| 6 | Contacts/suppliers | Address Book, linked to items, quotes, POs | Vendor pipeline (biz-dev, not in-product) | **P1** — product-ize vendor records as supplier entities |
| 7 | **Specification document** | Schedules — the core | ✎ Scope/proposal builder: scope rooms · per-room line items · sections · phases · exclusions · palettes · boards | **P0 — close mechanics gaps** (doc codes, item status chain, custom fields); the document itself exists. See §6.1 |
| 8 | Custom fields | Unlimited | — | **P0** (part of #7) |
| 9 | CSV/Excel import | Smart importer | — | **P1** — migration lever *away from Programa* |
| 10 | Doc codes + dup detection | Yes, real-time | — | **P0** (part of #7) |
| 11 | Item status workflow | Internal→Client→Approved→Ordered | ✎ FF&E procurement chain (specified→ordered→…→installed) + proposal status; no per-spec-item review chain yet | **P0 — add the review-stage enum**; execution statuses exist |
| 12 | Per-item spec-sheet PDF | Yes | — | **P1** |
| 13 | **Client share + approvals** | Dashboard + web link, visibility toggles, per-line verdicts, threads, revoke | ✎ Client portal renders proposals w/ tier visibility (full/milestone/curated) + accept/sign + engagement tracking; no per-line verdicts, threads, or tokenized web link | **P0 — close the loop** (per-line verdicts + threads + share link); the client surface exists. See §6.2 |
| 14 | Per-item financials | RRP/trade/discount/markup/client price/savings/profit; totals; bulk markup; multi-currency | ✎ Per-item trade price + markup % + client sell + line totals (`proposal_items` since 00014; FF&E dual-pricing 00185); single-currency | **P1 — extend** (multi-currency, savings %, bulk-markup); core financials exist. See §6.3 |
| 15 | Quote requests | Scoped supplier emails | None | **P1 / LEAPFROG** — route through maker network, not cold email |
| 16 | Purchase orders | Numbered, dated, taxed, PDF, email-send, drafts | ✎ PO lifecycle: numbered POs, supplier, dates, tax, lines, PDF render + email send, draft→sent (00148 + 00184–00190, `po-send`) | **P1 — largely built**; close gaps + network routing. See §6.4 |
| 17 | Mood boards | Pinboards + Pinterest/Canva | ✎ Freeform canvas boards (`proposal_boards`/`_items` 00179), editor + client render + project carry (00180) + clone carry (00260); no Pinterest/Canva import | **P2 — built**; extend import sources only if Leah needs them |
| 18 | Client presentations | Paged editor, pins, PDF export | None | **P2** — the Document *is* the presentation; test with Leah first |
| 19 | Tasks/phases/timeline | Full suite + ripple timeline + cross-project | None | **P2 light** — project state around the Document, not a PM clone |
| 20 | Meetings intelligence | Transcript → decisions/actions/questions | None (Ada territory) | **WATCH** — possible Ada-adjacent feature later |
| 21 | Time tracking | Timers, smart assignment, billing | ✎ Time tracking exists (entries/timers, critical-gaps 00177–00182); no smart auto-assignment or billing conversion | **SKIP billing** — tracking already exists; no billing engine (model) |
| 22 | Invoicing/payments | Programa Pay, Xero/QB | ✎ Invoicing + Stripe + AR exist (00178 + 00177–00182; needs prod keys/webhook); no Xero/QB sync | **SKIP accounting-sync / partner** — invoicing+Stripe already built |
| 23 | Smart search | Cross-entity ⌘K | Inbox has ⌘K triage | **P1** — portal-wide search over catalog/spec/notes |
| 24 | Home feed / nudges | Pulse + Today's Focus | None | **P2** — Desk-level "what needs you" strip |
| 25 | Rejection→alternatives | Launching (comment-based) | Thesis feature | **LEAPFROG** — see §7.1 |
| 26 | CAD integration | SketchUp extension (beta) | None | **WATCH** — revisit after network effects |
| 27 | Maker-side platform | Roadmap ("Brands") | Native to model | **LEAD — race.** See §7.2 |

## 6. Parity feature specs (build-ready detail)

### 6.1 P0 — The Patina Spec Document ("the Document grows a spine")

The schedule-equivalent, expressed in Patina's Document model rather than as a spreadsheet clone.

**Entities**
- `spec_documents` (id, project_id, title, status, currency, created/updated, share settings)
- `spec_sections` (id, doc_id, name, sort, room_tag)
- `spec_items` (id, doc_id, section_id, product_id → catalog, doc_code, qty, lead_time, status, assignee, supplier_id, sort)
- `spec_item_overrides` (per-item deviations from catalog record: finish, color, dims, notes) — keeps the catalog canonical while letting the spec diverge deliberately
- `spec_item_fields` (custom field defs per doc + values per item)

**Behaviors**
- Sections: create/rename/reorder/collapse; per-section counts and (later) totals.
- Items: add from **verified catalog** (primary path — this is the Patina twist: Programa adds unverified clips; Patina adds *verified records*), from URL (inline capture → inbox → attach), or custom one-off.
- Doc codes: auto-suggest from section prefix (CH-, TB-…), uniqueness check within doc, real-time collision warning.
- Status chain: `Draft → Internal Review → Client Review → Approved → Ordered` as item-level enum; bulk status actions per section.
- Item panel: mirrors capture-record anatomy (gallery, specs, provenance) + spec-context tab (qty, code, lead time, supplier, notes-internal vs notes-client).
- Lead time: enum matching Programa's granularity (In Stock, 1-2w … 24-26w) — designers already think in these buckets.
- Export: per-item PDF spec sheet; whole-doc PDF later.
- **Provenance surplus:** every item shows capture source + verification state — a trust layer Programa cannot show.

### 6.2 P0 — Client share & approval loop

- Share modes: (a) **client space** (email-invited, persistent per project), (b) **live web link**.
- Per-share visibility toggles: supplier · brand · source URL · pricing · details · feedback-enabled. (Match Programa's set exactly; designers will compare.)
- Client verdict per line: **Approve / Reject / Comment**, threaded replies; verdicts write back to item status and an `approval_events` log (who, when, verdict, comment).
- Access: regenerate link, revoke instantly, per-stakeholder listing.
- Rollups: pending-approval count per document and per project.
- Brand layer: studio logo/name on all client-facing surfaces (portal already carries Patina identity; add per-studio theming hooks).

### 6.3 P1 — Financial lens

- Per item: `rrp, trade_price, trade_discount_pct, markup_pct, client_price (derived), client_savings_pct (derived), net_profit (derived), currency`.
- Document Financial view: same rows, money columns; section totals excl. tax; doc totals (client price, profit); bulk markup apply.
- Visibility: financial fields are designer-only by default; client share shows `client_price` only when pricing toggle is on.
- Non-goal: tax engines, multi-entity accounting. Keep derivations transparent (show the math on hover — very Patina).

### 6.4 P1 — Quotes & POs, reframed by the network

- **Quote requests:** select items → group by supplier → send scoped request. Where the supplier is a **Patina maker**, the request lands in their portal (structured, trackable) instead of email; email is the fallback for off-network suppliers. This turns Programa's convenience feature into a network-acquisition loop: every RFQ to an off-network maker is a warm invite.
- **POs:** numbered (PO-prefix per project), supplier, issue/delivery dates, tax rate, note, product lines (qty, price), subtotal/tax/total, PDF render, draft → sent states. On-network POs also create the commission-attribution record — **the PO is where the business model gets its receipts.**

### 6.5 P1 — Capture pipeline additions (extend the lead)

- **Add-from-URL** inside the portal (paste → server-side extraction → inbox as captured → verify).
- **Refresh from source:** re-extract from origin URL, diff against verified record, propose field updates (never silently overwrite a verified record — verification is the brand).
- **CSV/Excel import** with mapping UI — pitched explicitly as the *migrate-off-Programa/spreadsheets* path.

## 7. Leapfrog features (only Patina can build these)

### 7.1 Taught alternatives (answer to Alternative Product Recommendations)

Programa's version reasons from one product + one rejection comment. Patina's version reasons from the **expertise layer**: the designer's annotations, ratings, tags, and approval history across every project — pgvector similarity over verified records, filtered by the taste signals Leah has already taught the system.
- Trigger: client rejects with comment → shortlist of alternatives *from the designer's own taught corpus first*, network catalog second.
- Every accepted/dismissed suggestion is a new training signal (closes the Designer-Taught Intelligence loop).
- Surface: item Approvals context + a Desk-level queue. Never phrased as "AI" — this is the flagship Designer-Taught Intelligence feature.

### 7.2 The maker side — win the race Programa just announced

Their "Brands" roadmap validates the two-sided thesis but starts from zero relationships on the maker side. Patina's counter-moves:
- Maker portal MVP: receive RFQs/POs, respond with quotes, confirm orders — the surfaces that make commission attribution natural.
- Every off-network RFQ/PO doubles as maker onboarding.
- Attribution ledger (spec → approval → PO → commission) as first-class data from day one.

### 7.3 Verified-record trust layer

Market the difference: Programa refreshes a scrape; Patina maintains **verified records with provenance and completeness scores**. Surface verification state everywhere a client or maker sees a product. This is cheap to show and impossible for them to retrofit quickly.

## 8. Deliberate non-goals

- **Time tracking, invoicing, payments, accounting sync** — Programa's revenue justification; Patina's model doesn't need them. Partner or ignore.
- **Full PM suite** — provide light project state (phases, key dates, pending counts) around the Document; do not clone boards/timelines.
- **CAD integrations** — revisit post-network; a Patina SketchUp bridge is credible later via the same product-data pattern they used.

## 9. Sequencing (fits the 22-week frame)

| Phase | Weeks | Delivers | Exit test |
|---|---|---|---|
| **A — Parity spine** | 1–6 | Spec Document (§6.1) on verified catalog; URL paste-in; refresh-from-source | Leah specs a real Middlewest project start-to-finish in Patina |
| **B — Close the loop** | 6–11 | Client share + approvals (§6.2); share visibility toggles; approval history | A real client approves/rejects lines without Kody in the loop |
| **C — Money & makers** | 11–17 | Financial lens (§6.3); RFQ + PO with network routing (§6.4); supplier entities | A PO with commission attribution lands with one on-network maker |
| **D — The moat** | 17–22 | Taught alternatives (§7.1); verification trust surfaces (§7.3); portal-wide search | A rejection produces an accepted alternative sourced from taught data |

Parallel track throughout: T-03 iOS capture ships whenever ready — it's uncontested surface area and feeds everything above.

## 10. Risks & open questions

1. **Speed of their assistance layer.** Alternative Recommendations shipping to their whole base compresses Patina's differentiation window. Mitigation: §7.1 must demonstrably out-perform on Leah's corpus, and the story must be told (Designer-Taught vs. comment-parsing).
2. **Brands program.** If Programa signs marquee makers to structured quoting before Patina's maker portal exists, the commission wedge narrows. Watch their releases; accelerate §7.2 if they announce maker tooling.
3. **Scope gravity.** The gap map tempts toward cloning; the model says stay thin. Every P2/SKIP line above is a decision, not an omission — revisit only with evidence from Leah's usage.
4. **Client-side polish bar.** Programa's client dashboard is where studios compare tools in front of clients. Phase B needs Middlewest-grade visual quality on day one.
5. **Financial derivations** (§6.3): confirm with Leah which of Programa's seven money fields she actually uses before building all seven.

## 11. Source log

- programa.design — features overview, schedules feature page, pricing (captured 2026-07-07).
- app.programa.design trial workspace — demo project walkthrough (2026-07-07).
- In-app changelog: Timeline release (2 Jul 2026), Alternative Product Recommendations (25 Jun 2026), SketchUp Extension beta (12 Jun 2026), Meeting Notes, Smart Search, Q3 roadmap post, Programa Pay regional expansion.
