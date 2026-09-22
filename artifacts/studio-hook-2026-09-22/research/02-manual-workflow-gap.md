# Lane 02 — The Manual Workflow Gap

**What this lane was asked.** Map the small design studio's *real* job-driving workflow
against what Patina can absorb today. For each job-to-be-done stage, decide whether Patina
has (1) a native surface, (2) an **import/capture** path that lets her bring what she already
has, (3) an **export** path (no lock-in), or (4) nothing. Then grade the
"bring your existing job into Patina in an afternoon" story and name the top five re-typing
burdens for a studio with ~8 active projects.

**Author.** Research subagent, 2026-09-22. Repo state: `main` @ `f51b4f39b`, tree clean.

**Evidence grades used throughout.**
- **VERIFIED** — I read the file/ran the command in this session; path + line cited.
- **INFERRED** — reasoned from verified facts, stated as such.
- **UNAVAILABLE** — I could not reach the evidence; named, not guessed.

**One thing up front, because it frames every number below.** Production data is
**UNAVAILABLE to this lane.** No Supabase MCP tool was exposed to this session
(`ToolSearch` for `execute_sql`/postgres returned no Supabase server), the configured
`supabase` CLI errored out in the sandbox (`supabase projects list` emitted a JS stack
trace, not a project list), and `.env*` files are sandbox-denied so no connection string was
readable. **Every "how many studios actually did X" question therefore has no row count in
this report.** All minute estimates below are derived from *field counts I read in the code*,
not from telemetry. Another lane should own the usage numbers.

---

## 0. The one-paragraph answer

Patina today is **excellent at the work that starts inside Patina and poor at the work that
already exists outside it.** There is exactly **one** bulk-import path in the whole designer
portal (a CSV/XLSX importer that lands rows in the *Library*, not in a project), exactly
**one** CSV export in the Document (hours), one CSV export in procurement (QBO vendor
bills), PDF exports of spec/schedule/invoice, and **zero** third-party data connections of
any kind — no Google Drive, Dropbox, Gmail, Google Calendar, QuickBooks, Houzz/Ivy, Studio
Designer, Mydoma, or Programa. The day-1 setup checklist has six rows and **not one of them
is "bring your existing work in."** The two capabilities that would most directly make a
studio feel she is saving time — the Chrome capture extension and the Field Line SMS rail's
reading surface — are both shipped-but-shut: the extension is pinned to `under_review` in
production with no install URL, and the Desk's reported-hours card sits behind an off
PostHog flag. The result is a portal that is genuinely faster than a spreadsheet *for the
ninth project* and dramatically slower than a spreadsheet *for the eight she already has* —
which is precisely the shape of "gets excited to set things up, then pops back out."

---

## 1. Stage-by-stage map

Legend: **N** native surface · **I** import/capture path · **E** export path · **—** nothing.

### 1.1 Client intake (email / phone call / website contact form)

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes — two doors | `apps/designer-portal/src/components/document/overlays/capture-lead-sheet.tsx` (5 fields: Name, Email, Phone, "The project (one line)", "Where from" — lines 161, 182, 197, 209, 232). Then `(document)/ceremony/[leadId]/page.tsx` and the Discovery folio (`components/document/discovery/`). Direct-to-project door: `overlays/open-project-sheet.tsx` (4 fields: Title, Household, Budget band min/max, Start date — lines 121–165), one RPC `open_project_direct` (00237). |
| **I** | **No inbound capture at all** | **VERIFIED: no public intake form exists.** `grep -rn "useCreateLead"` across `apps/` returns exactly three hits, all inside `capture-lead-sheet.tsx` (lines 31, 54, 125). No client-portal page, no marketing route, no edge function creates a lead. So the studio's own website contact form, her inbox, and her phone all still land outside Patina and get hand-copied in. |
| **I** | **No email forwarding / inbound mailbox** | The word "inbox" in Patina means a *notification* inbox, not an email one: `packages/supabase/src/hooks/use-inbox.ts` types `InboxNotification` off `notification_status`/`notification_channel` enums. There is no inbound-email parser anywhere — `grep -ril "inbound\|mailgun\|postmark"` over `supabase/` hits only SMS and compliance-document migrations, never mail ingest. The one genuinely inbound rail is SMS (`supabase/functions/sms-inbound/`, `verify_jwt=false`, live at v34). |
| **E** | Partial, JSON only | `apps/designer-portal/src/app/api/user/data-export/route.ts` returns a per-**user** GDPR JSON blob (`buildUserDataExport`); `api/me/data-export/route.ts` queues a `data_export_requests` row. Neither is a *studio* export and neither produces a spreadsheet. |

### 1.2 Mood boards (Pinterest / Canva)

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes, strong | Boards room (`(document)/boards/page.tsx`, `board/[boardId]/page.tsx`), 14 board hooks in `packages/supabase/src/hooks/use-boards.ts` (`useAddBoardItem:775`, `useSaveBoardLayout:996`, `useDuplicateBoard:693`, `useContinueBoardInProject:1126`), plus board templates (`use-board-templates.ts`). |
| **I** | Bulk **image** upload yes; **Pinterest explicitly refused** | Bulk upload: `components/mood-board/board-add-rail.tsx:1028-1029` (`accept="image/*"` + `multiple`) and `board-room-shell.tsx:1304`. **But** `apps/extension/src/lib/mode-detection.ts:57-66` hard-codes `KNOWN_BAD_DOMAINS = ['pinterest.com','pin.it','instagram.com','facebook.com','tiktok.com','x.com','twitter.com']`, plus any host starting `pinterest.` (per-country TLDs), and `isKnownBadDomain` (`:73-86`) makes capture **refuse them outright** with `KNOWN_BAD_DOMAIN_MESSAGE` — *"This page doesn't carry product details. Snapshot it, or add the piece by hand."* The reasoning in the comment (CL-R14) is sound engineering — pinboards render product-shaped markup with no product record — but the studio-facing consequence is that **the single most-used board tool in the industry is the one site Patina will not read.** |
| **I** | No Canva/Figma/PDF board import | No import path for a Canva board, a PDF presentation, or a JPEG board with regions. A composed Canva board can only arrive as a flat image. |
| **E** | PDF only | `supabase/functions/spec-pdf/index.ts` supports `kind: 'board'` and `kind: 'board-composition'` (header lines 18–23) — a section-grouped tile grid and persisted geometry on one landscape Letter page. No CSV/JSON board export. |

### 1.3 The FF&E schedule (the spreadsheet — the studio's real spine)

This is the single most important row in the table and the clearest gap.

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes, very deep | `components/portal/scope-builder/ffe-schedule-builder.tsx` (mounted live at `components/document/worktable/scheme.tsx:17` and `rooms/drafting/drafting-room.tsx:63`). Per-item editor fields I read at `:235-400`: **Name\*, Qty, Unit Price, Category, Room, Doc code, Lead time**, plus designer-defined custom fields (`fieldDefs`, `def.kind` of text/number/url at `:388-397`). Bulk *edit* acts exist — "Move selected to room" `:1676`, "Set item type" `:1694`, "Set lead time" `:1709`, "Markup percent" `:1731`. |
| **I** | **NOTHING at the project level** | **VERIFIED.** `grep -rn "ImportSheet"` over `apps/designer-portal/src` returns exactly three hits: the definition (`rooms/library/import-sheet.tsx:28`) and its two uses in `rooms/library/library-room.tsx:29,231`. The importer is **Library-only**. There is no CSV/XLSX drop onto a project's FF&E schedule, and no paste-a-table path. |
| **I** | A PDF FF&E extractor **exists and is not wired to anything** | `supabase/functions/project-ffe-document-extract/index.ts` takes a staged PDF from the `project-ffe-working` bucket (≤25 MB, `lib.ts:1`), sends it to `claude-sonnet-5` with a forced extraction tool, validates, and commits rows via `stage_project_ffe_document_extraction`. The DB side is fully built in `supabase/migrations/00437_ffe_service_boundaries.sql:112,163` and hardened in `00444`. **But `grep -rn "project-ffe-document-extract\|get_project_ffe_extract_upload\|stage_project_ffe_document_extraction"` over `apps/` and `packages/` returns ZERO callers.** The one feature that would let a designer drop last year's FF&E PDF into a project is fully built server-side and has no door in the portal. This is the highest-leverage dormant asset found in this lane. |
| **I** | The two-hop workaround | `rooms/library/import-sheet.tsx` accepts `.csv,.tsv,.xlsx,.xls` (`:177`), parses CSV inline and XLSX via lazy SheetJS, guesses headers (`import-parse.ts:119-131` maps name/brand/category/price/description/material/dimensions/sku/vendor), and POSTs to `/api/catalog/import`. That route caps at `MAX_ROWS = 5000` (`route.ts:30`) and stamps every row `status:'draft'`, `layer:'personal'`, `owner_user_id: user.id` (`:105-115`) so imports queue for teaching like any capture. Rows then reach a project **one at a time** via `usePlaceProductInProjectV2` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:178` → `place_product_in_project_v2`, `00445:134`), surfaced in `components/document/schedule/add-to-project-sheet.tsx:68`, `mood-board/board-add-rail.tsx:717`, `mood-board/board-room-shell.tsx:1520`. **No bulk placement act exists.** |
| **I** | What the importer drops | Nine text fields only. **No images** (`route.ts:104` writes `images: []`), **no vendor link** (`:112-114` — a mapped vendor *name* is provenance; only an explicit UUID sets `vendor_id`), no room, no doc code, no lead time, no quantity, no markup. Price parses dollars→cents (`parseUsdCents`); a cell beginning `= + @ -` is prefixed with `'` (`import-parse.ts:59-62`) and a formula-shaped price is rejected as invalid (`:134-138`). |
| **E** | PDF only, **client-facing money only** | `supabase/functions/spec-pdf/index.ts:1-24` — `kind: 'item' \| 'document'`, called from `ffe-schedule-builder.tsx:1016` (`downloadSpecPdf({ kind: 'document', proposalId }, 'schedule.pdf')`). The header states the invariant plainly: *"trade price, markup, and margin are never loaded into the render model."* **So there is no export of the studio's own schedule with its own cost basis, in any format.** A studio that wanted to leave, or to hand a bookkeeper the numbers, cannot get its FF&E out. This is in direct tension with VISION §4's "No lock-in… Your data exports." |

### 1.4 Vendor quotes (email out, email back)

| | Verdict | Evidence |
|---|---|---|
| **N** | Send side only | `supabase/functions/quote-request-send/index.ts` — created by `POST /api/vendors/[id]/quote-request`, recipient resolved `vendors.orders_email → contact_info->>'email'`, sent through `sendCompliantEmail`, **reply-to the designer**, `preview`/`send` modes. Trade side: `supabase/functions/trade-rfq-send/index.ts` opens *"their single-use response form on the client portal"* — so **trades do respond into Patina**. |
| **I** | **The furniture-vendor reply does not come back into Patina** | **VERIFIED from the schema.** `supabase/migrations/00162_designer_portal_backlog_schema.sql:31-49` defines `vendor_quote_requests` with `scope`, `timeline`, `message`, and `status IN ('draft','sent','responded','closed')` — and **no response columns at all**: no quoted price, no lead time, no attachment, no quote document. Combined with `quote-request-send`'s reply-to-the-designer, the vendor's PDF quote lands in **her own mail client**, and the number is hand-typed into the FF&E row and again into the PO. The vendor-pricing loop — arguably the studio's most expensive recurring admin task — is entirely outside Patina in both directions except the outbound ask. |
| **E** | — | Nothing. |

### 1.5 Proposals and agreements (Google Docs / Canva)

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes, deliberately deep | `(document)/drafting/[proposalId]/page.tsx`, `rooms/drafting/agreement/agreement-composer.tsx`, nine standard parts seeded by `materialize_standard_parts` reading `studio_agreement_defaults` (00575; `packages/supabase/src/hooks/use-studio-agreement-defaults.ts`), a studio Agreement Library of Parts + Templates (00576; `use-agreement-library.ts`), `template-picker-sheet.tsx`, `save-as-template-action.tsx`. |
| **I** | **Paste, not import** | `rooms/drafting/agreement/part-editor.tsx:20` imports `Textarea` from `@/components/ui/controls`; a `clause` or `list` part carries free prose (`readBody`/`readItems` from `part-kinds`). So a studio *can* paste her existing clause text part-by-part and `save-as-template-action` makes it reusable. That is a real path and the closest thing Patina has to "bring your paper in." What does **not** exist: a .docx/.pdf/Google-Docs importer, a whole-agreement paste-and-split, or any clause extraction. Nine parts × paste-and-reshape, per template. |
| **I** | Money can never be pasted | `part-editor.tsx:14-16` records ruling R5: *"prose never carries money. A `clause` or `list` editor cannot write a cents field."* Rate cards, deposits, activation and cadence are structured editors only. Correct design; means the commercial terms of an existing contract must be **re-entered as data**, not pasted. |
| **E** | Render, not export | Proposal/agreement PDF goes out through the share/send rail; `grep` for a proposal PDF download in the portal finds only `spec-pdf` (schedules) and the plans path (`plans/plan-confirm-strip.tsx:227`). No .docx, no markdown, no portable contract file. |

### 1.6 Invoices (QuickBooks / Wave / Stripe links)

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes | `(document)/…` accounts folio (`components/document/accounts/invoice-folio.tsx`), `invoices/[invoiceId]/print/page.tsx`, ~40 hooks in `packages/supabase/src/hooks/use-invoices.ts`, Stripe Checkout via `create-checkout-session` / `invoice-link-checkout`, `invoice-send`, `invoice-reminders`, ⌘K act "Draw an invoice · {project}" (`components/document/command-bar.tsx:823`). |
| **I** | **No import of any kind** | No QuickBooks/Wave/Xero/Stripe-invoice connection anywhere: `grep -ril "quickbooks\|xero"` over `apps packages supabase` returns only false positives (the substring "wave" in wave-numbered filenames) plus the QBO **export** function. A studio's outstanding receivables must be re-drawn line by line or left behind in the old tool — which is the single most likely reason she keeps QuickBooks open beside Patina. |
| **I** | Hours → invoice is **not** wired | `grep -n "time_entr\|hours"` over `use-invoices.ts` returns **nothing**. The hours ledger and the invoice composer do not meet. The bookkeeper's route is the CSV (below), i.e. out of Patina and back into another tool. |
| **E** | Good, for the bookkeeper | **Hours CSV:** `apps/designer-portal/src/lib/document/time-export.ts` — 14 fixed columns (Member, Date, Project, Client, Activity, Billable, Duration (min), Rate, Rate Source, Rate Role, Amount, Billing State, Invoiced, Invoice #; `:54-69`), RFC-4180 escaping plus Excel formula-injection guarding (`:71-82`, MS-04), fired from `components/document/hours-ledger.tsx:768-769` under `actionKey="export-time-csv"` (`:977`). `notes` is deliberately excluded (HT-36). **QBO vendor bills CSV:** `supabase/functions/qbo-export/index.ts` — a QuickBooks Online *Bills* import CSV, one row per `po_payments` event, date-range + project/vendor filters, `preview` mode, `X-Patina-*` count headers; called from `hooks/use-account-page.ts:232` and `use-procurement.ts:1808/1834`. **Invoice print:** `invoices/[invoiceId]/print/page.tsx`. |

### 1.7 PO tracking (the spreadsheet with ETAs on it)

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes, the deepest domain in the app | `create_purchase_order` via `useCreatePurchaseOrder` (`use-procurement.ts:491`) taking projectId, vendorId, paymentPattern, ffeItemIds[], vendorPoNumber, confirmedEta, isPatinaCatalog, depositDueDate, depositAmountCents, customMilestones[], sidemark, notes. Plus `fulfillment-po` (PO PDF via `_shared/po-pdf.ts`), `po-send`, `useLogPOAcknowledgment:555`, `useUpdatePurchaseOrderETA:663`, `useLogPaymentPaid:602`, `useStartPoCheckout:913`, receiving inspections `:1121/1400`, damage claims `:1170/1563`, delivery calendar `:1221`. |
| **I** | Nothing | No PO import. Every open PO the studio already has must be reconstructed: vendor, items linked, payment pattern, vendor PO number, ETA, deposit, milestones. |
| **E** | Partial | QBO CSV (above) covers the *payments*. A per-PO CSV exists on the **admin** side only (`apps/admin-portal/src/app/api/admin/fulfillment/pos/[poId]/csv/route.ts`) — not reachable by a studio. |

### 1.8 Scheduling (text messages + the designer's calendar)

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes | `use-schedule.ts` (`useScheduleMilestones:87`, `useProjectStartDate:119`, `useScheduleRevisions:142`, `useResolvedSchedule:216`), `use-schedule-compose.ts`, `use-schedule-proposals.ts`, `components/document/schedule/`, phase templates (`use-phase-templates.ts`, `apply_phase_template`, 00135), visits (`use-project-visits.ts`), `useDeliveryCalendar` (`use-procurement.ts:1221`). |
| **I / E** | **ZERO calendar interoperability** | **VERIFIED:** `grep -ril -E "\.ics\|icalendar\|VCALENDAR\|google calendar\|caldav"` across `apps packages supabase services` returns **no matches at all.** No ICS import, no ICS export, no Google/Outlook/CalDAV sync, no subscribe feed. Every date the studio already keeps in her calendar gets typed a second time, and nothing Patina schedules appears on her phone's calendar. For a workflow whose real coordination medium is a text message and a calendar alert, this is the most invisible of the gaps and probably the one that most reliably sends her back to her own tools. |
| **I** | The SMS rail is the exception, and it is the good news | The **Field Line**: `supabase/migrations/00639_field_line_authority.sql` (suppression, ref-code prompts, conversation context), `00641/00643/00645/00650/00651/00653`, `supabase/functions/sms-inbound/` (v34) + `field-daily/` (v31). Per `docs/field/sms-10dlc-runbook.md` §"FIELD_LINE_PHASE set to 3 (rail ON)" — `FIELD_LINE_PHASE=3` was set on Strata 2026-09-21 13:06Z, so the **trade rail sends**; `FIELD_LINE_CAMPAIGN_APPROVED` is still absent so **every homeowner template is refused**. This is the only place in the product where a participant does their part of the job **without learning anything** — they answer a text. |

### 1.9 Hours (a notebook, or Toggl)

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes | `components/document/time-capture.tsx`, `hours-ledger.tsx`, `log-time-sheet.tsx`, `log-time-shortcut.tsx`, `lib/document/time-derivation.ts`, `use-time-tracking.ts`, `use-time-autostart.ts`, studio member rates (`use-studio-member-rates.ts`), migrations 00595–00620 + `00653_field_time_reports.sql`. |
| **I** | No Toggl/Harvest/CSV import | Import is not implemented in either direction of the CSV module — `time-export.ts` is export-only. Historical hours cannot be brought in. |
| **I** | Text-in hours exist but the reading surface is **flag-off** | `field-daily/core.ts:1076-1077` sends the evening `sms_hours_prompt` at `automationPhase: 3` (after `HOURS_PROMPT_LOCAL_MINUTES = 17*60` local, `core.ts:91`) and `sms-inbound/pipeline.ts`'s `hoursReply()` (`:2832`, dispatched `:2923`) reads the reply — including, per the newest commit `e8e1f791b`, *off-grammar* replies via a typed judgment. The gate is now open (`FIELD_LINE_PHASE=3`). **But the runbook's own closing line states the Desk's reported-hours card only renders behind the PostHog flag `field-line-time-reports` (`field-desk.tsx:108`), which is off.** So a trade can text his hours in and the studio has no card to see them on. |
| **E** | Best in the app | The 14-column hours CSV (§1.6). |

### 1.10 Receipts and paperwork (the shoebox)

| | Verdict | Evidence |
|---|---|---|
| **N** | Compliance paper yes; **expenses no** | `supabase/functions/paperwork-upload/` + `core.ts` — a public, token-gated door (`verify_jwt=false`) where a trade or firm uploads its own COI/W-9 against a 64-hex token minted by `mint_paperwork_link` (00637). Portal side: `components/document/people/record-document-sheet.tsx`, `paperwork-link-act.tsx`, `inbound-queue-band.tsx`, `compliance-table.tsx`, `use-paperwork-links.ts`, `use-inbound-documents.ts` (an unverified-until-confirmed inbound queue, 00637). **There is no expense or receipt object** — `grep -ril "receipt\|expense"` over the portal returns only *receiving* inspections and unrelated matches; no expense table, no receipt capture, no reimbursables. |
| **I** | **The best import pattern in the whole product** | The paperwork door is the one place where **somebody else does the data entry**: the studio sends a link, the firm uploads, the document lands `inbound=true, verified_at IS NULL` beside the verified paper and never overwrites it, and the studio confirms or refuses with a reason (`use-inbound-documents.ts:14-26`). **This pattern is not used anywhere else** — not for vendor quotes, not for client intake, not for FF&E. |
| **E** | — | No bulk document export. |

### 1.11 Photos, rooms and site visits

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes, strongest differentiator | Patina Field (`apps/mobile/Capture`), 74 built screens per `apps/mobile/Capture/README.md:15-30`; scans → `services/scan-pipeline` → `room_files` / `room_file_measurements` / `scan_anchors` (00341) with SVG/PDF/DXF deliverables (`packages/supabase/src/hooks/use-room-files.ts:1-22`); `parse-room-scan`, `convert-room-scan-glb`, `confirm-scan-bundle`, `derive-scan-photo-media`; `(document)/room/[id]/file/page.tsx`. |
| **I** | Camera yes; **share sheet not built; no photo-library import** | `README.md:22` lists entry point **"E3 share-sheet"** and the repo contains a `CaptureShareExtension/` directory — which is **EMPTY** (`ls` returns nothing, `find` finds only the directory itself) and has **no Xcode target**: `grep -c "CaptureShareExtension" apps/mobile/Capture/Capture.xcodeproj/project.pbxproj` → **0**. So a designer cannot share a photo, a PDF, or a link from any other iOS app into Patina Field. `PHPicker/PhotosPicker` appears in only two files (`Features/Resilience/ResilienceScreens.swift`, `Features/Receiving/ReceivingInspectionScreen.swift`), so there is no bulk import of an existing project's photo roll. |
| **E** | Yes, for scans | Signed downloads of SVG/PDF/DXF sheets from the private `room-scans` bucket; README `:215` describes a Share/AirDrop/Save-to-Files path for the three files. |

### 1.12 Product sourcing (the web-browsing habit)

| | Verdict | Evidence |
|---|---|---|
| **N** | Library room, Compose page | `(document)/library/page.tsx`, `library/[id]`, `library/judgments`; `(document)/compose/page.tsx` — the "anti-wizard" composing page (`components/document/compose/composing-page.tsx:1-21`), five facets, saveable at any percent. |
| **I** | Chrome extension — **built, and not installable in production** | The extension is real and capable: five save paths (library, project room, inbox, decision, update — `apps/extension/CLAUDE.md`, `src/state/effects.ts`), per-field confidence badges, sticky project/room, `Ctrl/Cmd+Shift+S`, context menus, portal-session-cookie sign-in with QR fallback. **But production is pinned closed.** `apps/designer-portal/wrangler.jsonc:35` sets `"NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE": "under_review"` and there is **no `NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_URL` var in the prod block at all**; `src/lib/capture-extension.ts:36-44` therefore returns `mode:'under_review', installUrl:null`, and `rooms/library/capture-extension-prompt.tsx:80-83,105` renders *"The Chrome update is under review. Paste a product URL below to capture it now"* with a **"Paste a URL"** primary act instead of "Add to Chrome". (Memory corroborates: *CWS 0.3.0 draft staged 2026-09-02 — Submit not clicked.*) VISION §5 ranks **"Capture. Any product into the library in under ten seconds"** as differentiator #4; in production it is currently a one-URL-at-a-time paste. |
| **I** | Paste-a-link is live and is the real fallback | `capture-from-url` edge function (`supabase/functions/capture-from-url/index.ts`) fetches server-side behind SSRF hard-guards (`ssrf.ts`), extracts name/brand/price/images/description, modes `capture` and `refresh` (refresh diffs per-field, never silently overwrites), rate-limited via `quota.ts`. Client: `packages/supabase/src/hooks/use-capture-from-url.ts`. **One URL per act.** |
| **E** | — | No library CSV/JSON export. The importer is one-way. |

### 1.13 Contacts / the rolodex

| | Verdict | Evidence |
|---|---|---|
| **N** | Yes, shared at the studio | People room (`(document)/people/page.tsx`, `components/document/people/`), `studio_contacts` fully shared across active non-guest members (`00417_studio_contacts…:1-27`), merges (00629), channels + consent (00593/00594/00622), compliance docs (00623), `directory/add-person-sheet.tsx` (2,314 lines; four kinds — client/household, maker, field party, company — with per-kind fields: maker = name/category/orders email/website `:454-458`; field party = name/company/trade/phone/email/project/consent `:459-475`). |
| **I** | **Auto-fold from Patina's own data only — no external contacts import** | **VERIFIED:** `grep -ril "vcard\|vcf\|contacts import"` over `apps packages` → **no matches.** The "Seed the rolodex" act (`directory/rolodex-seed-sheet.tsx:1-16`) is a *review of an auto-fold* from rows Patina already had (00417/00418 lineage from `project_parties`), and the checklist's own hint says so: *"The rolodex fills itself from your projects"* (`account/studio-setup-checklist.tsx:188`). For a **new** studio with no Patina projects, the auto-fold has nothing to fold — so the rolodex starts empty and every contact is typed. No Google Contacts, no vCard, no CSV. |
| **E** | — | Nothing. |

### 1.14 Setup itself

**VERIFIED — the day-1 checklist has six rows and none of them is an import.**
`apps/designer-portal/src/components/document/account/studio-setup-checklist.tsx` (251 lines),
rows keyed `named-and-branded`, `own-title-set`, `crew-invited`, `rolodex-seeded`,
`first-project`, `first-hire-opened` (`:145-234`). Three carry a scored word (invite sheet,
rolodex review + Skip, open-project door). The closing line is the product's philosophy in
one sentence: *"The marks follow the work. Nothing on this list is something you tick — do
the thing and the box fills."* (`:239-243`).

That philosophy is right for the *ongoing* studio and is precisely wrong for the *arriving*
one. The list tells a new owner to name her studio, set her title, invite her crew, glance at
an empty rolodex, and open **one** project — and then stops. It never asks about the eight
projects already running, and offers no act for them. **INFERRED:** the checklist is a
faithful map of the excitement phase Kody describes, and its silence after row 5 is a fair
description of where studios fall out.

### 1.15 Third-party connections, exhaustively

**VERIFIED: there are none.** `grep -ril -E "google drive|dropbox|googleapis|oauth2|gmail|houzz|ivy|studio designer|mydoma|programa"` across `apps packages supabase services` returns only false positives (email-template and unsubscribe copy, a Storybook story, `stripe-webhook`). The complete outbound third-party surface is: **Stripe** (payments), **Resend** (email), **Twilio** (SMS/10DLC), **PostHog** (analytics), **Anthropic API** (extraction/inference), **Sanity** (help CMS), **Apple** (the only OAuth provider — `wrangler.jsonc:36` `"NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS": "apple"`). **No data integration exists with any tool a design studio already uses.**

---

## 2. The scoreboard

| Stage | Native | Import / capture | Export | One-line verdict |
|---|:--:|:--:|:--:|---|
| Client intake | ✅ | ❌ no form, no mail-in | ⚠️ user JSON | Hand-copied from her inbox, every time |
| Mood boards | ✅ | ⚠️ bulk images; **Pinterest refused** | ⚠️ PDF | Her boards live where Patina won't look |
| FF&E schedule | ✅✅ | ❌ project-level; ⚠️ Library CSV → 1-by-1 place; 💤 PDF extractor unwired | ⚠️ PDF, **no cost basis** | The spine, and the worst gap |
| Vendor quotes | ⚠️ send only | ❌ reply has nowhere to land (`00162:31-49`) | ❌ | Priced in her mail client, typed twice |
| Proposals / agreements | ✅✅ | ⚠️ paste per clause; no doc import | ⚠️ render only | Re-composed, not migrated |
| Invoices | ✅ | ❌ nothing | ✅ QBO CSV + print | Old A/R stays in QuickBooks |
| PO tracking | ✅✅ | ❌ nothing | ⚠️ QBO payments only | Open POs reconstructed by hand |
| Scheduling | ✅ | ❌ **zero ICS/calendar, in or out** | ❌ | Typed twice; invisible on her phone |
| Hours | ✅ | ❌ no import; ⚠️ SMS-in built, **card flag-off** | ✅✅ 14-col CSV | Best export, no history |
| Receipts / paperwork | ⚠️ compliance only | ✅✅ **token door: they upload** | ❌ | The one pattern worth copying |
| Photos / rooms | ✅✅ | ⚠️ camera only; **share ext. empty, no target** | ✅ signed SVG/PDF/DXF | Strongest native, weakest on-ramp |
| Product sourcing | ✅ | ⚠️ extension `under_review`; paste-a-URL live | ❌ | Differentiator #4, shut in prod |
| Contacts | ✅ | ❌ auto-fold from Patina only | ❌ | Empty for a new studio |

`💤` = built and unreachable.

---

## 3. Grading "bring your existing job into Patina in an afternoon"

**Grade: D.** An afternoon gets one project set up well. It does not get a studio moved.

**What can genuinely be brought in (an afternoon's worth):**
- Studio identity, title, crew invites — checklist rows 1–3.
- A vendor/product spreadsheet → the **Library** (≤5,000 rows, 9 text fields, no images, no vendor FK) — `import-sheet.tsx` + `/api/catalog/import`.
- Board images in bulk (`multiple`) — if she already has the JPEGs on disk.
- Existing contract clause prose, pasted part-by-part, then saved as a Template.
- Compliance paper, by sending trades and vendors a paperwork link and letting **them** upload.
- One project opened in 4 fields.

**What must be re-typed:**
Every FF&E line of every existing project (name, qty, unit price, category, room, doc code,
lead time). Every contact. Every open PO. Every outstanding invoice. Every milestone and
every date. Every agreement's commercial terms (R5 forbids pasting money). Every historical
hour. Every vendor quote number as it arrives.

**What is impossible today:**
- Importing a Pinterest board (actively refused, `mode-detection.ts:73-86`).
- Importing an FF&E spreadsheet **into a project** (Library only).
- Getting her FF&E schedule **out** with her own cost basis (`spec-pdf` header invariant).
- Any calendar in or out (no ICS anywhere in the repo).
- Any QuickBooks/Wave/Stripe invoice import.
- Any contacts import.
- Sharing anything from another iOS app into Patina Field (`CaptureShareExtension` empty, 0 pbxproj references).
- Installing the Chrome extension in production (`under_review`, no install URL).

---

## 4. Top five re-typing burdens, ~8 active projects

**Method, stated so it can be argued with.** Minutes are **INFERRED** from field counts I
read in the code (cited per row) times a keystroke-and-think estimate; **no telemetry backs
them** (see §0). Studio shape assumed: 8 active projects, ~30 FF&E lines each (≈240),
~25 contacts, ~15 open POs, ~6 outstanding invoices, ~4 boards per project.

| # | Burden | Why no path exists | Est. minutes |
|:--:|---|---|---:|
| **1** | **240 FF&E lines into 8 project schedules** | No project-level import (`ImportSheet` is Library-only, 3 grep hits). Best case = CSV → Library (~10 min) then **240 one-at-a-time placements** via `usePlaceProductInProjectV2`, each still needing room + doc code + lead time + qty, which the importer never carried (`route.ts:104-115`). Worst case = 240 × 7 fields by hand in `ffe-schedule-builder.tsx:235-400`. | **170–360** |
| **2** | **Boards: re-sourcing every Pinterest pin** | `isKnownBadDomain` refuses `pinterest.*`, `pin.it`, Instagram et al. outright. Each pin must be opened, the real product page found, then pasted into `capture-from-url` **one URL at a time** (the extension that would batch this is `under_review`). ~32 boards × ~15 usable pins ≈ 480 pins; even at 3 pins/min of hunting-and-pasting this dwarfs everything else — capped below at the realistic "she does the top 100." | **120–240** |
| **3** | **15 open POs reconstructed** | Zero import. Each needs vendor, linked FF&E items, payment pattern, vendor PO number, confirmed ETA, deposit date + amount, milestones, sidemark, notes (`useCreatePurchaseOrder`, `use-procurement.ts:491-516`) — and the numbers come off PDFs sitting in her mail client, because `vendor_quote_requests` has no response columns. | **75–120** |
| **4** | **25 contacts into an empty rolodex** | No vCard/CSV/Google import (`grep`: no matches). The auto-fold has nothing to fold for a new studio. 4–7 fields per contact across four kinds (`add-person-sheet.tsx:454-475`), plus consent source/evidence for anyone who will be texted. | **60–100** |
| **5** | **8 agreements + 6 outstanding invoices re-composed** | Agreements: nine standard parts each, prose pasted part-by-part, **money re-entered as structured data** (R5, `part-editor.tsx:14-16`) — cheaper after the first becomes a Template. Invoices: no import from QuickBooks/Wave/Stripe, and **no hours→invoice bridge** (`grep` for `time_entr` in `use-invoices.ts`: nothing), so every line is drawn by hand. | **90–150** |

**Total: roughly 8 to 16 hours of pure transcription** before Patina holds what her
spreadsheets already held this morning — and every hour of it is spent *before* she has felt
a single minute saved. **INFERRED**, but the direction is not in doubt: the cost is front-loaded
and the benefit is back-loaded, which is the textbook shape of the abandonment Kody
described.

**Honourable mentions** (real, smaller): no calendar import means ~8 projects × ~6 milestones
re-typed and then kept in two places forever; no hours history import means the
studio's rate-and-utilisation baseline starts at zero on day one.

---

## 5. Assets that are built and shut (highest leverage per engineering hour)

Not solutions — inventory. Each is **VERIFIED** above.

1. **`project-ffe-document-extract`** — a Claude-backed FF&E extractor for a ≤25 MB PDF, with
   its RPCs, bucket, integrity checks and ACL hardening all live (`00437`, `00444`), and
   **zero portal callers**. The missing piece is a door, not a feature.
2. **The Chrome extension** — feature-complete at 0.3.0, gated shut by one wrangler var and
   an unclicked CWS Submit. Differentiator #4 in VISION §5.
3. **`field-line-time-reports`** — `FIELD_LINE_PHASE=3` is set and `sms-inbound` v34 reads even
   off-grammar hours replies, but the Desk card that would show them is behind an off flag.
4. **The paperwork door pattern** (`paperwork-upload` + `use-inbound-documents`) — the only
   place in the product where the *other party* does the data entry, with a correct
   unverified-beside-verified queue. Used for exactly one document type.
5. **`capture-from-url`** — SSRF-guarded server-side extraction with a per-field `refresh`
   diff. Currently one URL per act, surfaced only as a fallback when the extension is shut.

---

## 6. Implications (evidence only — flagged, not proposed)

1. **The gap is on-ramps, not features.** Thirteen stages, twelve with a real native surface,
   and one genuine bulk-import path in the entire portal. Patina is not missing product; it is
   missing doors into the product for work that already exists.
2. **The spine is the spreadsheet, and the spreadsheet cannot get in or out.** No project-level
   FF&E import; no FF&E export carrying the studio's own cost basis. Both directions of the
   studio's most-used artifact are closed.
3. **Two promises in VISION are currently unmet by the code.** §4's *"No lock-in… Your data
   exports"* is contradicted by the `spec-pdf` money invariant plus the absence of any FF&E/
   contacts/PO/board export. §5's *"Capture. Any product into the library in under ten
   seconds"* is contradicted by `wrangler.jsonc:35`.
4. **Every participant except the studio owner can be made to do the typing — and one of them
   already is.** The paperwork door proves the pattern works inside Patina's own
   constraints; the vendor-quote schema (`00162:31-49`) shows the same idea absent where the
   money is.
5. **The SMS rail is the only surface that honours "no new system to learn" literally.** It is
   also the one whose studio-facing reading surface is switched off.
6. **The setup checklist's philosophy is right for month two and wrong for hour one.** "The
   marks follow the work" assumes the work is already happening *in Patina*. Six rows, zero
   about the eight jobs already running.
7. **Where the calendar gap actually bites.** Scheduling is the one stage with **nothing** in
   either direction, and it is also the stage the studio coordinates by text and calendar
   alert — i.e. the stage where popping back out to her old habit costs her nothing at all.

---

## 7. What this lane could not verify

- **All production usage.** No Supabase MCP in this session; `supabase` CLI errored in the
  sandbox; `.env*` sandbox-denied. No row counts for: studios created, imports run, extension
  installs, FF&E items per project, QBO/hours exports taken, paperwork links sent.
  *(Recommend another lane own this.)*
- **Whether Strata's shared Patina catalog is populated.** `supabase/config.toml [db.seed]`
  lists 30 **local-dev** seed files only; production catalog contents are unknown. If it is
  thin, the "don't retype your vendors" benefit does not yet exist either.
- **Real transcription speed.** Minute estimates are field-count-derived, not measured. A
  timed pass of one studio moving one project would replace §4 with facts.
- **Whether the Chrome extension's CWS submission is blocked or merely un-clicked.** The repo
  shows `under_review` and staged listing copy (`docs/design/capture-launch/cws-listing.md`);
  the actual CWS dashboard state is outside this session.
- **`(portal)` route-group status.** `components/portal/**` is imported live by the Document
  (`worktable/scheme.tsx:17`, `drafting-room.tsx:63`), but no `(portal)` pages exist under
  `src/app`. Whether other `components/portal` code is dead was not swept.
