# D3 — The designer portal's project flow, as it exists in code

**Date:** 2026-08-24 · **Agent:** D3 (read-only repo survey) · **Program:** Patina Field → true field companion
**Scope surveyed:** `apps/designer-portal/src` (routes, components, hooks, lib), `packages/supabase/src/hooks`, `packages/types`, `supabase/migrations`, design docs under `docs/design/the-document` and `docs/design/field-capture`.
**Method:** direct file reads + grep. Every claim below carries a path. Where I could not prove something from code I say **INFERENCE**.

---

## 0. Headline

The portal's project flow is one surface — **the Document** — plus three global Rooms and four Ledgers. Everything a designer does lives at `/desk`, `/doc/[id]`, and a small set of Rooms/sheets that slide over them. The old `/portal/*` zone tree was dissolved (R21).

**The field story in that surface is thin and disconnected.** Concretely:

1. There is **no `field_captures` inbox anywhere in the portal.** The table (00233), its state machine (00235), and its `capture-media` bucket (00234) are written *only* by iOS. The portal reads `field_captures` in exactly one place — the Room File's capture-context list — and reads it by JSONB provenance containment, not by project.
2. The **`capture-media` storage bucket is never referenced by any web code.** `grep -rn "capture-media" apps/ packages/` (excluding `apps/mobile/Capture`) returns nothing. Field photos and voice **audio** are therefore unreadable in the portal today; only `voice_transcript` / `notes` text renders.
3. The two places the portal offers to attach "the scan" both read **client-owned** scans, never the designer's own Field scans: `useClientScans` filters `room_scans.user_id = clientProfileId` (`components/document/letterhead-instruments.tsx:87–95`), and Discovery's scan picker uses `useClientRoomScans`, which filters `room_scans.user_id = designer_clients.client_id` (`packages/supabase/src/hooks/use-room-scans.ts:185–214`). A designer's site scan attaches to `room_scans.project_id` (00265) and **has no surface on `/doc/[id]` at all**.
4. `RoomFilesSection` — the component whose docstring says it is "the project detail page's Room Files zone" — **is not mounted anywhere.** It survived the R21 dissolve as dead code (`components/room-file/room-files-section.tsx`; grep for `RoomFilesSection` finds only its own file).
5. Conversely, **two genuine field↔portal loops already ship and work**: the SMS triage loop (`apply_field_effect`, 00282, surfaced on the Desk via `FieldDesk`/`SmsReviewCard`) and the Site Request loop (00374, surfaced in the document margin via `MarginHandoffItem`). Both are *inbound from a third party* (a sub, an installer), not from Leah's own phone. **Neither has a portal-side create surface** — Site Requests are drafted only from iOS (`apps/mobile/Capture/Capture/Features/SiteRequests/SiteRequestContract.swift`).

The pattern: Patina already knows how to turn a field signal into a structural mutation — but only when the signal comes from *someone else's* phone via SMS or a guest link. Leah's own phone has an upload path and no landing place.

---

## 1. The route map

`apps/designer-portal/src/app` — every `page.tsx`:

| Route | File | What it is |
|---|---|---|
| `/` | `app/page.tsx` | entry/redirect |
| `/desk` | `app/(document)/desk/page.tsx` | **The Desk** — needs-your-hand folios + Studio Pulse + Contents |
| `/doc/[id]` | `app/(document)/doc/[id]/page.tsx` (1640 lines) | **The Document** — one engagement, seven sections, spine + margin + shelves |
| `/doc/[id]/plans` | `app/(document)/doc/[id]/plans/page.tsx` | Plan room (drawing set) |
| `/doc/[id]/spec-book` | `app/(document)/doc/[id]/spec-book/page.tsx` | Spec book workspace |
| `/ceremony/[leadId]` | `app/(document)/ceremony/[leadId]/page.tsx` | Match ceremony (flag `arrival-arc`) |
| `/drafting/[proposalId]` | `app/(document)/drafting/[proposalId]/page.tsx` | Drafting Room — 8 proposal facets |
| `/board/[boardId]` | `app/(document)/board/[boardId]/page.tsx` | Mood board room |
| `/compose` | `app/(document)/compose/page.tsx` | Composing page (a catalog piece) |
| `/library`, `/library/[id]`, `/library/judgments` | `app/(document)/library/*` | The Library (3 shelves) |
| `/people` | `app/(document)/people/page.tsx` | The People Room |
| `/rooms` | `app/(document)/rooms/page.tsx` | **The Rooms** — every scanned room, all clients |
| `/room/[id]` | `app/(document)/room/[id]/page.tsx` | Room View (`[id]` = **scan id**, not `rooms.id`) |
| `/room/[id]/file` | `app/(document)/room/[id]/file/page.tsx` | **Room File** (flag `room-file`) |
| `/help/*` | `app/(document-help)/help/*` | help centre |
| `/auth/*`, `/preferences/*`, `/unauthorized` | — | chrome |

Three global **Rooms** and four global **Ledgers** are declared in `lib/document/registry.tsx`:
Rooms `library` · `people` · `rooms` (+ `drafting-room`, document-scoped); Ledgers `orders` · `accounts` · `hours` · `the-post` (+ `call-sheet`, document-scoped); Verbs `capture-lead` · `open-project` · `draft-proposal` · `draw-invoice` · `add-maker`. ⌘K (`components/document/command-bar.tsx`) and the Desk Contents page (`components/document/desk-contents.tsx`) both read this registry — **it is the canonical place a new "Field inbox" surface would have to be declared.**

**Three different "room" concepts exist and must never be conflated:**
- `rooms` — legacy table (`/portal/rooms/:id`, mostly retired).
- `project_rooms` — the project's scope/budget rooms (00066). Read by `useDocumentRooms` (`hooks/use-document-rooms.ts`), rendered in the spine (`components/document/spine-rooms-block.tsx`) and as FF&E headings.
- `room_scans` — LiDAR scans. Read by `/rooms`, `/room/[id]`, `/room/[id]/file`. The header of `app/(document)/room/[id]/file/page.tsx` states the trap explicitly: "⚠ ROOM id ≠ SCAN id."

---

## 2. The engagement model (what a "project" *is*)

The whole surface is driven by one Postgres view: **`document_state`** (00191, evolved through 00327). One row per *engagement*, in four shapes:

`engagement_kind ∈ { 'lead' | 'proposal' | 'relationship' | 'project' }`
`active_section ∈ { brief | discovery | direction | proposal | project | install | care }`

The row's full column list is mirrored in TypeScript at `lib/document/desk-derivation.ts:43–96` (`DocumentStateRow`) — worth reading in full: it carries `overdue_decision_count`, `awaiting_inspection_count`, `blocked_item_count`, `in_flight_count`, `open_claim_count`, `unsent_pulse_count`, `draft_unsent_po_count`, `unacked_po_count`, `due_task_count`, etc.

**There is no scan, capture, photo, or field column in `document_state`.** That is the single most consequential structural fact for this program: nothing field-originated can rise onto the Desk through the normal engagement path without either (a) a new column on the view, or (b) a separate Desk population (the precedent for (b) exists three times over — `FieldDesk`, `OpenRequestsStrip`, `DeskReconnect`).

Section derivation: `lib/document/section-derivation.ts` (`deriveSections`).
Worktable table selection (flag `worktable`): `lib/document/table-derivation.ts` maps `active_section` → one of four tables — **intake** (brief/discovery), **speccing** (direction + draft proposal), **finalize** (sent proposal), **delivery** (project/install/care, with `setting: 'procurement' | 'install'`).

---

## 3. Stage-by-stage map

### Stage 1 — Lead / design request → the Brief

| | |
|---|---|
| **Routes** | `/desk` (capture + pool + triage), `/doc/[leadId]` (Brief), `/ceremony/[leadId]` |
| **Components** | `overlays/capture-lead-sheet.tsx` · `open-requests-strip.tsx` · `triage-bar.tsx` · `brief-section.tsx` · `brief-scan-strip.tsx` · `ceremony/ceremony-surface.tsx` |
| **Hooks** | `useLead`, `useBeginDiscovery` / `useNurtureLead` / `useDeclineLead` (triage), `useOpenDesignRequests` / `useClaimDesignRequest` / `useAcceptDesignRequest` (00286), `useLeadScans` + `useRoomScanCovers` |
| **Tables** | `leads` (00014), `designer_clients`, `lead_room_scans` (00285), `match_ceremonies` |
| **Flags** | `design-request-pool` (pool strip), `arrival-arc` (ceremony + triage's ceremony branch) |
| **Field inputs this stage needs** | client's own room scans (✅ **present**), site photos (⚠ only via a scan's `room_scan_images`), a designer's voice impression of a walk-through (❌ nowhere), contact capture from a job-site meeting (❌ — `capture-lead-sheet` is a typed web form) |

`BriefScanStrip` (`components/document/brief-scan-strip.tsx`, mounted at `brief-section.tsx:133`) is the **one surface in the whole portal that shows scan thumbnails inline in a document**. It reads `lead_room_scans` — i.e. scans a *client* attached to a design request. Its own docstring notes `room_scans.thumbnail_url` is "perma-NULL in practice"; covers come from `room_scan_images` via `useRoomScanCovers`.

### Stage 2 — Discovery (the brief becomes structured facts)

| | |
|---|---|
| **Route** | `/doc/[id]`, Discovery section |
| **Components** | `discovery/discovery-section.tsx` (8 blocks) · `discovery/editors.tsx` · `discovery/call-plan.tsx` · `discovery/discovery-margin.tsx` · `discovery/discovery-recap.tsx` · `discovery/field-kit.tsx` (⚠ **"field-kit" here means *form fields*, not on-site — a naming collision to avoid in this program**) |
| **Hooks** | `useDiscovery` / `useUpsertDiscovery` / `useBeginDirection` (00224), `useStyles`, `useClientRoomScans`, `useCreateMarginNote` |
| **Tables** | `discovery` (00224), `margin_notes` (00196), `room_scans` |
| **Flags** | none |
| **Captured today** | `project_type`, `rooms[]`, budget min/max + basis, `target_date` / `hard_date` / `start_urgency`, `style_tag_ids` + `style_keywords`, `lifestyle[]`, `keep_items[]` / `avoid_items[]`, `decision_makers[]`, **`site_notes`**, **`room_scan_id`** (`discovery-section.tsx:52–68`) |

The **SiteScanEditor** block (`discovery/editors.tsx:295–325`) is the closest thing to a field slot in the whole flow: a `<Select>` labelled "Room scan (iOS RoomPlan)" plus a free-text "Measurements & constraints" textarea placeholdered `9'2" ceilings · two columns in living`. **Its options come from `useClientRoomScans` — client-owned scans only.** A designer who scans the site on Patina Field cannot pick it here.

Discovery's margin is the one place designers write freeform prose (`discovery-margin.tsx` → `useCreateMarginNote`). The section's own docstring calls this "R66's load-bearing split": structured facts in blocks, unstructured call note in the margin.

### Stage 3 — Direction / concept + mood boards

| | |
|---|---|
| **Routes** | `/drafting/[proposalId]` (8 facets: Rooms · FF&E · Palette · Boards · Phases · Exclusions · …), `/board/[boardId]` |
| **Components** | `rooms/drafting/drafting-room.tsx` · `rooms/drafting/facet-section.tsx` · `project-mood-boards.tsx` · `shelves/mood-boards-leaf.tsx` · `mood-board/board-add-rail.tsx` · `worktable/boards-strip.tsx`, `worktable/scheme.tsx` (flag `worktable`) |
| **Hooks** | `useDraftingState`, `useBoards` / `useProjectBoards` / `useProjectOwnedBoards` / `useAddBoardItem` / `useSaveBoardLayout` (`packages/supabase/src/hooks/use-boards.ts`), `useUpsertBoard`, `prepareAndUploadBoardImages` |
| **Tables** | `proposals` (+ items/phases/scope_rooms/exclusions/milestones), `proposal_boards` + board items, `mood-board-assets` storage bucket |
| **Flags** | `worktable` (speccing table only) |
| **Field inputs needed** | showroom/market photos of fabric, finish, a piece in situ (⚠ **partial** — boards accept browser file upload at `board-add-rail.tsx:817–842`, but there is no mobile/field ingestion path and no "boards" destination in `commit_field_capture`) |

Note: board items carry `project_room_id` (`shelves/mood-boards-leaf.tsx` docstring), so a room-scoped field photo has a real anchor available.

### Stage 4 — FF&E / specification

| | |
|---|---|
| **Route** | `/doc/[id]` (Project/Install section); also the Spec book shelf and `/doc/[id]/spec-book` |
| **Components** | `ffe-section.tsx` · `line-unfold.tsx` · `stamp.tsx` · `components/portal/ffe/stages.ts` (`STAGE_CONFIG`) · `schedule/*` (authorized-schedule ticks, composition bar, release ceremony) · `shelves/spec-book-leaf.tsx` |
| **Hooks** | `useProjectFFEItems`, `useFfeInvoiceCoverage`, `useProjectFfeReadiness`, `useTriageProjectFfeItems`, `useAssignLineRoom` (`hooks/use-document-rooms.ts`), `usePlaceInDocument` |
| **Tables** | `project_ffe_items` (8 ranked stages, rank-ratchet 00184), `project_rooms`, `products` |
| **Flags** | `worktable` for the table framing; the FF&E section itself is unflagged |
| **Field inputs needed** | product specimen captured at a market (⚠ **partial**), dimensions/measurements from site (❌), a photo of the existing piece being replaced (❌), vendor/SKU/price from a showroom tag (⚠ partial) |

**Where a field product capture actually lands:** `commit_field_capture` (00235) inserts into `products` with `layer='personal'`, `status='draft'`, `capture_source='field_capture'`, `field_capture_id`, `capture_provenance` — i.e. the designer's **My Library** shelf (`components/document/rooms/library/library-room.tsx:43` labels that shelf "raw captures · from the extension, photos, paste"). Optional project routing writes **`project_products`**, *not* `project_ffe_items`. And `project_products` has **no live reader in the document-era portal**: the only hook that reads it, `hooks/use-library-tabs.ts:68`, is itself unreferenced. So "route this capture to a project" from the phone produces a row nothing displays.

`products.capture_source` / `capture_provenance` (00232) are **never read by the portal** — grep for `capture_source` in `apps/designer-portal/src` returns nothing. A field-captured piece is visually indistinguishable from a pasted URL on the Library shelf.

### Stage 5 — Proposal / approvals (Start to Signature)

| | |
|---|---|
| **Routes** | `/drafting/[proposalId]`, `/doc/[id]` Proposal section, client mirror overlay |
| **Components** | `proposal-instruments.tsx` · `proposal-preview.tsx` · `proposal-watch.tsx` · `proposal-blocks-readonly.tsx` · `overlays/send-sheet.tsx`, `overlays/mark-signed-sheet.tsx`, `overlays/revise-sheet.tsx`, `overlays/amendment-sheet.tsx` · `worktable/finalize-head.tsx`, `worktable/release-lift.tsx`, `worktable/seal-turn.ts` (flag `worktable`) · `commercial/*` (service agreements, trade scopes, work orders, draw schedules) · `approvals/project-approval-document.tsx` |
| **Hooks** | `useProposal`, `useProposals`, `useProjectApprovals`, `useProposalFeedback`, `useItemFeedback`, `useCommercialDocuments`, `useProposalActivation` |
| **Tables** | `proposals` chain, `item_feedback`, `project_approvals`, `commercial_documents`, `scope_change_requests` |
| **Flags** | `worktable` |
| **Field inputs needed** | client's verbal approval captured on site (❌ — approvals are client-portal acts or `mark-signed-sheet`), a signature/photo of a marked-up plan (❌), a walk-through decision (⚠ — decisions exist but must be composed in the web composer) |

### Stage 6 — Procurement / orders

| | |
|---|---|
| **Surface** | the **Orders** ledger (a sheet, not a route) — `orders-ledger.tsx`, `orders-book-week.tsx`, `orders-book-vendors.tsx`, `orders-book-receiving.tsx`; plus `po-preview.tsx`, `procurement-trail.tsx` and `components/portal/procurement/order-assistant.tsx` |
| **Hooks** | `usePurchaseOrders`, `useReceivingInspections`, `useDamageClaims`, `useUpdateDamageClaim`, `useCreateReceivingInspection`, `useOrders` |
| **Tables** | `purchase_orders`, `po_payments`, `receiving_inspections` (00150), `damage_claims`, `delivery_events` |
| **Flags** | `procurement-workspace-pilot` (legacy `/portal/procurement/*` gate; the ledger itself rides the Drawer) |

### Stage 7 — Receiving / install

| | |
|---|---|
| **Surface** | Orders ledger → Receiving page; the FF&E line unfold's Inspect act; `schedule/install-window-ceremony.tsx`; `roster/call-sheet.tsx` (flag `call-sheet`) |
| **Components** | `orders-book-receiving.tsx` + `components/portal/procurement/log-inspection-drawer.tsx` (one component, two doors) |
| **Tables** | `receiving_inspections` (`photo_asset_ids UUID[]`, `notes`, `outcome ∈ clean|damaged|partial`), `damage_claims` |
| **Field inputs needed** | delivery photos, damage photos, short-count evidence, punch items found at install, site conditions |

`receiving_inspections.photo_asset_ids` exists (00150:43) and `useCreateReceivingInspection` accepts `photoAssetIds` (`packages/supabase/src/hooks/use-procurement.ts:1045,1418`). **The web drawer always passes an empty array** (`log-inspection-drawer.tsx:151` `const photoAssetIds: string[] = []`) and tells the user so: *"attach photo evidence. Desktop logs the inspection without photos."* (`:466–467`). **No portal surface renders `photo_asset_ids`** — grep finds it only in the hook, the types file, and that empty-array line.

iOS *does* have the photo-rich flow: `apps/mobile/Capture/Capture/Features/Receiving/{ReceivingInspectionViewModel,SupabaseReceivingService}.swift` and `CaptureKit/Work/ReceivingService.swift`. **So receiving photos may already be being written by the phone into rows the portal will never show.** (INFERENCE — I did not verify the iOS side actually uploads and populates `photo_asset_ids`; that is D1/D2's territory.)

### Stage 8 — Coordination (running the job; punch lists; the field crew)

This is the richest existing "field" machinery.

| | |
|---|---|
| **Components** | `coordination/coordination-band.tsx` · `coordination/coordination-work.tsx` (mounted from `schedule/schedule-spine.tsx:1038`) · `coordination/court-bar.tsx`, `court-group.tsx`, `open-item-row.tsx`, `open-item-sheet.tsx` · `coordination/item-composer.tsx` · `coordination/item-resolve/{resolve-punch,resolve-rfi,resolve-selection,resolve-signoff,resolve-submittal,resolve-waiting}.tsx` · `roster/*` (Call Sheet, roster rows, reach chips) · `people/party-profile-sheet.tsx` |
| **Hooks** | `useCoordinationItems`, `useCourtSummary`, `useCreateCoordinationItem`, `useResolveCoordinationItem`, `useProjectParties`, `useAddProjectParty`, `useRecordPartySmsConsent`, `useProjectRoster`, `usePartySmsThread`, `useSendPartySms`, `useActiveFieldLink`, `useCreateFieldLink`, `useFieldMediaUrl` |
| **Tables** | `client_decisions` **widened** (00213: `coordination_kind`, `court`, `blocks_kind`; 00281 widened `court` with `sub`/`installer`/`receiver`), `project_parties` (00281: `trade`, `phone_e164`, `sms_consent_status`), `project_tasks` (00169 + 00215 dep web + 00479 `starts_on`), `sms_conversations`/`sms_messages` (00282), `field_links` (00283) |
| **Flags** | `call-sheet` (roster, rolodex picker, party profile, the composer's party picker, letterhead instrument, ⌘K row) |

**The five workflow shapes** (`components/document/coordination/item-type.ts`): `selection` · `rfi` · `submittal` · `signoff` · **`punch`**. A punch item *is* a `client_decisions` row with `coordination_kind='punch'`. **The composer has no photo/attachment affordance at all** — grep for `photo|image|attach|upload` across `item-composer.tsx`, `open-item-sheet.tsx`, `item-resolve/resolve-punch.tsx` returns nothing.

**`apply_field_effect` (00282:225–470) is the existing single mutation choke point** and the best template in the codebase for "a field signal becomes structural work". Its effect vocabulary:

| effect `type` | what it writes |
|---|---|
| `mark_done` | `project_tasks.status='done'` **or** delegates a coordination resolve |
| `report_delay` | pushes a task/item date; summary "Pushed …" |
| `flag_blocker` | **INSERTs a `client_decisions` RFI in the designer's court** |
| `punch_report` | **INSERTs a punch `client_decisions` row** |
| `confirm_delivery` | closes the delivery task |
| `note` | no structural mutation — surfaces only as the `sms_message` row + the `field_sms` margin branch |

It is `SECURITY DEFINER` and **`REVOKE ALL … FROM PUBLIC, anon, authenticated`** (00282:472) — service-role only, and it is anchored on `p_party_id` (a `project_parties` row is the authority anchor). **A designer is not a party**, so Leah's own phone cannot call it as-is.

### Stage 9 — Close / Care

| | |
|---|---|
| **Components** | `care-band.tsx` (mounted at the tail of Project/Install) · `quiet-sections.tsx` (CareSection) · `lib/document/closure-derivation.ts` |
| **RPC** | `close_project` (00238) |
| **Checklist** | walkthrough · punch_list · payment · **photography** · **photos** ("Final project photos on file (for portfolio)") · case_study (`closure-derivation.ts:22–29`) |

Two of the six closure lines are about photographs, and **the portal has no place to put a final project photo.** They are attestation checkboxes only.

---

## 4. Everything that displays field-originated data today

| # | Surface | File | Reads | Gated by | Notes |
|---|---|---|---|---|---|
| 1 | **Desk → Studio Pulse → "In the field"** | `components/document/field/field-desk.tsx` (mounted from `studio-pulse.tsx`, which the Desk mounts at `desk/page.tsx:376`) | `useSmsReviewQueue` (`sms_messages.needs_review`) + `useFieldActivity` (`field_activity_summary`) | none | Triage cards + soft need-lines. **Folded** behind "Open pulse" — one extra click before any field work is visible. |
| 2 | **Field triage card** (Apply / Dismiss, editable date) | `components/document/field/sms-review-card.tsx` | `useReviewSmsMessage` → `review_sms_message` → `apply_field_effect` | none | The one place a field signal becomes a task/date/punch with one tap. |
| 3 | **Margin `field_sms` item** | `lib/document/margin-derivation.ts:11–47`, `margin_items` view (00282 leg) | `sms_messages` | none | `needs_review` stays raised; applied/logged sinks to Settled. |
| 4 | **Margin handoff item — Site Requests** | `components/document/margin-handoff-item.tsx` | `useProjectContextualHandoffs` (00442/00443 projection over `site_requests`) | none | Acts: `useApproveSiteRequestItem`, `useRequestSiteRequestRedo`, `useNudgeSiteRequest`, `useCloseSiteRequest`. Photos + measured dimensions come back through `site_deliverable_media` / `site_deliverable_dimensions` (00374). |
| 5 | **Brief scan strip** | `components/document/brief-scan-strip.tsx` | `useLeadScans` (`lead_room_scans`) + `useRoomScanCovers` | none | Client-request scans only. Tiles open `/room/[scanId]?from=document&docId=…`. |
| 6 | **Letterhead "The scan"** | `components/document/letterhead-instruments.tsx:87–95, 287–297` | `room_scans WHERE user_id = clientProfileId`, limit 5, first-with-image | none | **Client-owned scans only.** |
| 7 | **Discovery site-scan block** | `components/document/discovery/editors.tsx:295–325` + `discovery-section.tsx:146,255,345,463` | `useClientRoomScans` | none | **Client-owned scans only.** Writes `discovery.room_scan_id` + `discovery.site_notes`. |
| 8 | **The Rooms roster** | `components/document/rooms/room-view/rooms-index.tsx` → `useRoomRoster` → `room_scan_documents` view (00339) | every scan RLS lets you see, newest first | none | Resolves each scan to its Document (project → proposal → relationship → lead precedence). |
| 9 | **Room View** | `app/(document)/room/[id]/page.tsx` + `rooms/room-view/*` | `useRoomGeometry`, `useRoomScanPhotos` (`room_scan_images`) | `room-file` (drawings link), `room-view-refined-path` | Plan, facts rail, measure layer, photo strip/markers, mesh + **splat** modes. |
| 10 | **Room File** | `components/room-file/room-file-view.tsx` | `useRoomFiles`, `useRoomFileMeasurements`, `useScanContextCaptures` | **`room-file`** (fail-closed) | Drawings, accuracy certificate, published measurements, render gallery, version strip. |
| 11 | **Capture context list** (inside the Room File) | `components/room-file/capture-context-section.tsx` | `useScanContextCaptures` (`packages/supabase/src/hooks/use-room-files.ts:355–395`) | `room-file` | **The only place a field voice note renders in the portal**: `notes` + `“voice_transcript”` + a photo count. Thumbnail renders *only* if `thumbnail_url` already begins `http(s)` — the docstring says capture-bucket signing is "out of this slice's scope". |
| 12 | **Party profile sheet** (SMS thread + field link) | `components/document/people/party-profile-sheet.tsx` | `usePartySmsThread`, `useFieldMediaUrl` (signed MMS), `useActiveFieldLink` | **`call-sheet`** | Inbound MMS thumbnails DO render here. |
| 13 | **Account → Devices** (Field sign-in QR) | `components/document/account/account-devices-page.tsx` → `components/auth/PairDeviceQR` | `use-device-pair` / `use-field-login-qr` | none | The portal→phone handshake. |

### Notable wire-contract trap (already documented in code)

`useScanContextCaptures` filters on the **flat, dotted** provenance key the phone actually writes:
```
.contains('provenance', { 'siteScanContext.scanId': scanId })
```
`packages/supabase/src/hooks/use-room-files.ts:361–395` warns that the design doc's nested `provenance->siteScanContext->>scanId` path "matches zero real captures". Frozen contract: `apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/ContextCaptureProvenance.swift`.

The same hook documents an **RLS asymmetry (P2)**: `room_files` / `room_file_measurements` delegate SELECT to the scan's visibility (owner + designer-association + studio co-member, 00341), but `field_captures` does not — its read policy is `designer_id = auth.uid()` + org scope (00233). **A studio co-member who can see a scan's drawings sees an empty capture list.**

---

## 5. Field input → portal destination

Legend: ✅ exists · ⚠ partial · ❌ missing.

| Field input | Portal destination that should receive it | State | Exact hook / table today |
|---|---|---|---|
| **Room scan (LiDAR)** — designer's own, on a site visit | `/doc/[id]` Project section (a Rooms/Scans block) | ❌ | `room_scans.project_id` (00265) is writable by Field; `useProjectRoomScans(projectId)` **exists** (`use-room-scans.ts:406`) but its only consumer, `RoomFilesSection`, is **unmounted**. |
| Room scan — attach at Discovery | `discovery.room_scan_id` | ⚠ | Field is set, but the picker lists **client** scans only (`useClientRoomScans`). Swapping/uniting the source is a one-hook change. |
| Room scan — letterhead instrument | letterhead "The scan" | ⚠ | `useClientScans` in `letterhead-instruments.tsx` — client-owned only. |
| Room scan — roster | `/rooms` | ✅ | `useRoomRoster` → `room_scan_documents` (00339). Works for designer-owned scans. |
| **Room File drawings + measurements** | Room File leaf; the Plan-room shelf; the spec book | ⚠ | `useRoomFiles` / `useRoomFileMeasurements` exist and render at `/room/[id]/file` behind `room-file`. **Nothing links to it from `/doc/[id]`** — the only door is `/room/[id]` → Room File, or a direct URL. |
| **Measurement (single dimension)** — "the alcove is 42¾″" | `room_file_measurements` (published set) · or `site_deliverable_dimensions` (00374) · or Discovery `site_notes` | ⚠ | Measurements published by the scan solve are read-only in the portal. The only *typed-in* dimension surface is Discovery's free-text `site_notes` and `components/document/dimension-fields.tsx` (used for pieces, not sites). |
| **Site photo** (a condition, an outlet, an existing piece) | a project photo set | ❌ | **No `project_photos`-style table exists.** The candidates are `room_scan_images` (scan-scoped), `mood-board-assets` (board-scoped), `comms` attachments (message-scoped), `site_deliverable_media` (request-scoped). None is project-general. |
| **Product specimen** (market/showroom) | My Library personal shelf | ✅ | `commit_field_capture` → `products(layer='personal', capture_source='field_capture')`; shelf renders at `/library`. |
| Product specimen — routed to a project | project FF&E schedule | ❌ | `commit_field_capture` writes **`project_products`**, which no live portal surface reads. The FF&E path is `usePlaceInDocument` → `project_ffe_items` and is web-only. |
| Product specimen — provenance visible | Library card / piece folio | ❌ | `products.capture_source` / `capture_provenance` (00232) never read by the portal. |
| **Voice note (transcript)** — general | a project note | ⚠ | Renders **only** inside the Room File's capture-context list, and only for captures pinned to a scan. `margin_notes` (00196) is the natural home and is **never written by iOS**. |
| **Voice note (audio)** | playback anywhere | ❌ | `field_captures.voice_audio_path` points into `capture-media`; **no web code references that bucket at all**. |
| **Voice note → a task** | `project_tasks` | ❌ | `useCreateSectionTask` (`hooks/use-section-work.ts`) is web-only. `apply_field_effect`'s `mark_done`/`report_delay` are party-anchored + service-role-only. |
| **Voice note → a decision / RFI** | `client_decisions` (`coordination_kind='rfi'`) | ⚠ | The mechanism exists (`flag_blocker` in `apply_field_effect`; `useCreateCoordinationItem` on web; `useEscalateNoteToDecision` from a margin note) — but nothing routes a designer's own capture into it. |
| **Punch-list item found at install** | `client_decisions` (`coordination_kind='punch'`) | ⚠ | `punch_report` effect exists for a **texting party**. Web composer exists (`item-composer.tsx`). **Neither carries a photo.** |
| **Client preference / decision spoken on site** | `client_decisions` + `client_decision_options` (options DO carry `image_url`) | ❌ | Composed only in `coordination/compose-decision-sheet.tsx` / `item-composer.tsx` on web. |
| **Delivery / receiving status + damage photos** | `receiving_inspections.photo_asset_ids`, `damage_claims` | ⚠ | Column + hook param exist; web writes `[]` and renders nothing; iOS has the flow. |
| **Party contact captured on site** (a GC's number) | `project_parties` (+ `phone_e164`, consent) | ⚠ | `useAddProjectParty` + `roster/rolodex-picker.tsx` behind **`call-sheet`**; web-only. |
| **Site conditions / constraints prose** | `discovery.site_notes`; `margin_notes`; a coordination RFI | ⚠ | All web-authored. |
| **Third-party field text (SMS)** | `sms_messages` → Desk triage → `apply_field_effect` | ✅ | The one complete loop. |
| **Third-party guest capture** (measure set / detail photos) | `site_deliverables` + media + dimensions → margin handoff → Binder approval | ✅ (inbound) / ❌ (create) | Portal can approve/redo/nudge/close; **only iOS can draft and send** (`site_request_create_draft` / `site_request_send` called from `SiteRequestContract.swift` only). |
| **Final project photos (close-out)** | portfolio / closure checklist | ❌ | `closure-derivation.ts` items `photography`/`photos` are checkboxes with no store. |

---

## 6. Where notes, tasks and decisions live (the escalation ladder)

This is the ladder a field voice note would have to climb, and every rung already exists on the web:

```
margin_notes (00196)                     private studio marginalia
  · body, anchor_kind ∈ line|section|letterhead, anchor_id, due_date
  · project_id XOR proposal_id (chk_margin_notes_engagement)
  · escalated_to_decision_id → client_decisions
  · escalated_to_scope_change_id → scope_change_requests
  · RLS: designer_id = auth.uid() (author-scoped; widened for studios in 00205/00316)
      ↑ written by:  hooks/use-margin-notes.ts  useCreateMarginNote
      ↑ UI:          components/document/margin-rail.tsx:386–421  (note composer,
                     "R14: ≤5 seconds — one tap, type, save"; due date defaults to today 17:00)
                     discovery/discovery-margin.tsx, discovery/call-plan.tsx
      ↑ read:        margin_items view, 'note' branch (00197:196–222)
      ↓ escalate:    useEscalateNoteToDecision → rpc create_client_decision
                     useEscalateNoteToScopeChange
                     UI: components/document/margin-bodies.tsx:823

project_tasks (00169 + 00215 + 00479)    the work
  · section_key, title, status todo|done|blocked, due_date, starts_on,
    estimate_minutes, owner ∈ designer|client|gc|vendor, owner_party_id,
    blocked_by_item_id, seq_after_task_id
      ↑ hooks/use-section-work.ts  useSectionTasks / useCreateSectionTask / useToggleSectionTask
      ↑ UI: coordination/coordination-work.tsx (mounted by schedule/schedule-spine.tsx:1038),
            work-block.tsx
      ↑ field write path: apply_field_effect mark_done / report_delay (party-anchored)
      → Desk: `due_task_count` on document_state → need kind `task_due`

client_decisions (widened 00064/00171/00213/00281)   decisions AND coordination items
  · coordination_kind ∈ selection|rfi|submittal|signoff|punch
  · court ∈ designer|client|gc|vendor|sub|installer|receiver, court_party_id
  · blocks_kind ∈ none|ffe|task|phase; blocking_status; due_date
  · options: client_decision_options (name, image_url, …)
      ↑ useCreateCoordinationItem / useResolveCoordinationItem (rpc resolve_coordination_item, 00218)
      ↑ UI: coordination/item-composer.tsx, open-item-sheet.tsx, item-resolve/*
      ↑ field write path: apply_field_effect flag_blocker (→ rfi) / punch_report (→ punch)
      → Desk: overdue_decision_count → need kind `overdue_decision`
      → margin: 'decision' branch
```

Plus **`comms_threads` / `comms_messages`** — the shared, client-visible channel. The letterhead "Send a note" instrument posts here (`letterhead-instruments.tsx`, `useSendDocumentNote`); attachments are supported (`packages/supabase/src/hooks/use-comms-attachments.ts`). Anchors added in 00193 (`anchor_kind` / `anchor_id`, NULL = letterhead).

**Every margin kind:** `decision · message · invoice · pulse · time · note · field_sms` (`lib/document/margin-derivation.ts:11–19`, view `margin_items` 00194 → 00197 → 00206 → 00282). Adding a `field_capture` kind to this view is the smallest-possible way to make Leah's own captures visible in the document she is standing in. **INFERENCE**, but the precedent is exact: `field_sms` was added the same way.

---

## 7. The Desk model and triage mechanics

**Data:** `hooks/use-desk-engagements.ts` — one batched read, 60 s refetch, `keepPreviousData`. Sources in that batch: `document_state`, `delivery_events`, `invoices`, `item_feedback` (×2), `match_ceremonies`, `project_phases`, plus the client-side builders `desk-conflicts.ts`, `desk-receivables.ts`, `desk-flagged-lines.ts`, `desk-ceremonies.ts`, `desk-schedule.ts`.

**Derivation:** `lib/document/desk-derivation.ts` → `partitionDesk()` returns two populations:
- **`folders`** — needs-your-hand. Each folder gets exactly ONE need line ("the one thing"), plus the full priority-ordered `needs[]` chain.
- **`chips`** — in-motion. Never actionable.

**The 20 need kinds** (`desk-derivation.ts:98–128`) with their footer acts (`NEED_ACTION_LABELS`, `:130–151`):
`overdue_decision` · `overdue_invoice` · `proposal_signed` · `damage_claim` · `proposal_declined` · `proposal_expired` · `lines_flagged` · `new_lead` · `ceremony_pending` · `reconnect_due` · `hesitating_proposal` · `awaiting_inspection` · `schedule_conflict` · `schedule_proposal` · `task_due` · `schedule_unconfigured` · `po_unsent` · `po_unacknowledged` · `pulse_due`.

**No field/capture need kind exists.** `awaiting_inspection` and `damage_claim` are the closest — both procurement-shaped.

**The Desk's rendered order** (`app/(document)/desk/page.tsx:174–390`):
1. Greeting + date + three acts: **Capture a lead** (primary) · **Open a project** · **Find anything (⌘K)**.
2. First-touch `MarginNote` (once-only, localStorage `patina:margin-note:*`), optional walkthrough offer, optional `StudioSetupWhisper` (flag `studio-workspaces`).
3. **Needs your hand** — `NeedsYourHandFolios` (`folder-card.tsx`), 1–2 columns.
4. **Studio Pulse** — one folded section with a single preview sentence, containing four sub-populations, each owning its own hooks/flags/errors: `OpenRequestsStrip` (flag `design-request-pool`), in-motion chips, `DeskReconnect`, **`FieldDesk`**.
5. `RecentBoardsStrip`.
6. **Desk Contents** — book front matter (Rooms / Ledgers / Begin) from `lib/document/registry.tsx`. Rises above Pulse on an empty Desk (`deskEmpty`).

**Whole-desk error state (I64):** a 0-row `document_state` read with an invalid session **throws**, and the page replaces everything below the greeting with a single "The desk could not be read." block — deliberately including the field populations, so you never get a half-desk.

**Triage inside a folder:** `TriageBar` (`components/document/triage-bar.tsx`) — three verbs on a lead: *Accept · begin* (`useBeginDiscovery`), *Nurture* (`useNurtureLead`, always asks for a reconnect date), *Pass* (`useDeclineLead`). `new_lead` and `reconnect_due` are the two need kinds with `actionLabel: null` because the TriageBar carries the choices.

**Field triage:** `SmsReviewCard` — quote, who + trade + project, the proposed effect in words, an editable date for delays, then **Apply / Dismiss** → `useReviewSmsMessage` → `review_sms_message` → `apply_field_effect`. **This card is the design template for any "field capture needs your hand" surface.**

**There is no generic `needs_review` queue.** The only `needs_review` in the system is `sms_messages.needs_review` (00282). `field_captures.status='inbox'` is the semantic equivalent and has no reader.

---

## 8. Feature flags to be aware of

All PostHog, **fail-closed**, resolved through `hooks/use-feature-flag.ts` (with `NEXT_PUBLIC_FLAG_OVERRIDES` env escape, format `flag-a:true,flag-b:false`). Local dev also needs `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true`.

| Flag | Gates | Files |
|---|---|---|
| `room-file` | **the entire Room File surface**, including the capture-context list and the Room View's drawings link | `components/room-file/room-file-view.tsx:62`, `rooms/room-view/room-view.tsx` |
| `call-sheet` | Call Sheet, roster, rolodex picker, party profile sheet (**and therefore the SMS thread + field link**), the coordination composer's party picker, the letterhead instrument, the ⌘K row, the Desk setup whisper's rolodex step | 13 call sites |
| `worktable` | the four-table Worktable composition on `/doc/[id]` (Start to Signature W2–W4) | `app/(document)/doc/[id]/page.tsx` |
| `arrival-arc` | `/ceremony/[leadId]`, ceremony branches in TriageBar + OpenRequestsStrip | 3 call sites |
| `design-request-pool` | the Desk's open-requests pool strip | `components/document/open-requests-strip.tsx` |
| `studio-workspaces` | Account → Studio page, the Desk setup whisper | 9 call sites |
| `room-view-refined-path` | Room View refined/splat path | `rooms/room-view/room-view.tsx` |
| `procurement-workspace-pilot` | legacy `/portal/procurement/*` | 4 call sites |

**Consequence for this program:** a flag-off designer today sees *no* Room File, *no* SMS thread, and *no* field link — i.e. **most of the existing field↔portal surface is dark by default.** Any Field Companion work must decide whether it rides these flags or gets its own.

---

## 9. Gaps, ranked, with the exact seam each would use

### G1 — There is no field inbox. (severity: highest)
`field_captures` has a full state machine (`queued → synced → inbox → saved|dismissed`, 00233) and three RPCs (`commit_field_capture`, `route_field_capture`, `dismiss_field_capture`, 00235) and **zero portal readers**. A capture parked at `status='inbox'` is invisible forever.

*Seam:* add a Desk population beside `FieldDesk` (exact precedent: `useFieldDeskPopulation` + `FieldDesk` inside `StudioPulse`) reading `field_captures WHERE designer_id = auth.uid() AND status = 'inbox'`, with a card modeled on `SmsReviewCard` whose acts call the existing `route_field_capture` / `dismiss_field_capture`. Register a `field` surface in `lib/document/registry.tsx` so ⌘K and Desk Contents can reach it.

### G2 — Field media is unreadable by the web. (severity: highest)
No web code references the `capture-media` bucket (00234). `CaptureContextSection` renders a thumbnail only if the row already carries an `http(s)` URL and says so in its own docstring.

*Seam:* the signing pattern already exists twice — `letterhead-instruments.tsx:118–130` (`storage.from('room-scans').createSignedUrls(paths, 3600)`, batched) and `useFieldMediaUrl` (MMS, used in `party-profile-sheet.tsx`). A `useCaptureMediaUrls(paths)` batch hook mirroring `useRoomScanCovers` is the smallest unit of work.

### G3 — The designer's own scan has no home in the document. (severity: high)
`room_scans.project_id` is writable by Field (00265) and `useProjectRoomScans` exists — but `RoomFilesSection`, its only consumer, is unmounted, and the two attach points (letterhead, Discovery) read client-owned scans only.

*Seam:* (a) mount a Rooms/Scans block on the Project section of `/doc/[id]` (or as a **shelf** — `lib/document/shelves.ts` currently has planroom/specbook/moodboards/callsheet/knowledge/clientcopy and no scans shelf); (b) broaden `useClientRoomScans` and `useClientScans` to union designer-owned scans on the same project/relationship. Both are contained changes.

### G4 — A voice note cannot become work. (severity: high)
Transcripts exist on `field_captures`; the ladder (`margin_notes → client_decisions | project_tasks | scope_change_requests`) exists; nothing connects them. `apply_field_effect` — the one existing "signal → structure" RPC — is party-anchored and service-role-only, so it cannot serve a designer's own capture without a sibling.

*Seam:* either (i) write `margin_notes` from a routed capture (author-scoped RLS already fits: `designer_id = auth.uid()`), then reuse the shipped `useEscalateNoteToDecision` / `useEscalateNoteToScopeChange`; or (ii) mint a designer-anchored analogue of `apply_field_effect`. (i) reuses more shipped code and lands the note in the margin the designer is already reading. **This is a recommendation, not a finding.**

### G5 — Photos cannot attach to the things that most need them. (severity: high)
- Punch / RFI / any coordination item: **no attachment field at all** (verified by grep).
- Receiving inspection: `photo_asset_ids` exists, web writes `[]`, nothing renders it.
- Project close-out: two photo checklist lines, no store.
- There is **no project-general photo table**.

*Seam (partial, cheap):* `client_decision_options.image_url` already exists (`use-decisions.ts:57,476,615`) — a punch item's *option* can carry a picture today. `comms` attachments already work end-to-end. The honest structural answer is a project-scoped media table or reuse of `site_deliverable_media`'s shape; that is a schema decision, not a wiring one.

### G6 — Field captures are invisible to studio co-members. (severity: medium)
`field_captures` RLS is `designer_id = auth.uid()` + org (00233), while `room_files`/`room_file_measurements` delegate to `room_scans` visibility (00341). `use-room-files.ts:363–372` flags this as a known P2. With `studio-workspaces` live, a co-member reading a scan's drawings sees an empty capture list.

### G7 — Site Requests can only be created from the phone. (severity: medium)
`site_request_create_draft` / `site_request_send` (00374) are called only from `apps/mobile/Capture/Capture/Features/SiteRequests/SiteRequestContract.swift`. The portal has the whole *response* half (`useApproveSiteRequestItem`, `useRequestSiteRequestRedo`, `useNudgeSiteRequest`, `useCloseSiteRequest`) via `MarginHandoffItem`. Two built-in kits ship: **K-01 Measure set** (floor→sill, sill→head, run length; 1/16″ precision; proof photo) and **K-02 Detail photos** (wide context, straight on, left return, close detail).

*Observation:* K-01/K-02 are exactly the "capture kit" grammar this program wants for Leah's own captures. Reusing that kit vocabulary for a self-capture would give the portal a ready-made structured landing shape.

### G8 — Routed product captures land where nothing looks. (severity: medium)
`commit_field_capture` writes `project_products`; the document-era portal reads it only from the unreferenced `hooks/use-library-tabs.ts`. And `products.capture_source` is never displayed.

*Seam:* route through `usePlaceInDocument` (the FF&E path the Piece Room's "Add to project" sheet uses, `rooms/piece/add-to-project-sheet.tsx`) instead of / in addition to `project_products`; render a provenance chip on the Library card.

### G9 — Nothing field-shaped can rise on the Desk through the normal path. (severity: medium)
`document_state` has no field columns and `NeedKind` has no field member. Any "3 captures waiting on Maple St" line must be a separate population (three precedents exist) or a view change.

### G10 — The Room File is reachable only from the Room. (severity: low–medium)
`/room/[id]/file` links back to `/room/[id]`; nothing in `/doc/[id]` links forward to it. The deliverable a designer walked a site to produce is two undiscoverable hops away, behind a fail-closed flag.

### G11 — "Field kit" already means something else. (severity: naming)
`components/document/discovery/field-kit.tsx` is a set of *form field* primitives (`Field`, `TextInput`, `NumberInput`, `DateInput`, `Select`). Do not reuse the name for on-site tooling.

---

## 10. Recommendations for where field captures should land

Ordered by "designer never re-enters data" value per unit of work. All of these ride shipped seams.

1. **A Field inbox as a Desk population + a registry surface.** Mirror `FieldDesk` exactly: `useFieldCaptureInbox()` → cards modeled on `SmsReviewCard` → acts calling `route_field_capture` / `dismiss_field_capture`. Because `StudioPulse` folds its children, consider raising unrouted captures to *Needs your hand* rather than into the fold — a capture with no destination **is** an act.
2. **Sign `capture-media`.** One batched hook (`createSignedUrls`) unlocks photos and audio across every surface at once. Nothing else in this list looks right without it.
3. **Union designer-owned scans into the two existing attach points** (Discovery `SiteScanEditor`, letterhead "The scan"), and mount a scans block or shelf on the Project section. This is where the tape-measure promise actually pays off.
4. **Route a capture's transcript into `margin_notes`** with `anchor_kind`/`anchor_id` set from the capture's provenance (`siteScanContext.*` already carries scan and — per project memory — project association). The margin is where Leah already reads; the escalate-to-decision/scope-change acts are already built.
5. **Add a `field_capture` branch to the `margin_items` view.** The `field_sms` branch (00282) is the byte-for-byte precedent, including the golden-hour accent and the raised/settled rule.
6. **Give coordination items an attachment.** A punch item without a photo is a punch item nobody can act on. Cheapest first step: reuse `client_decision_options.image_url`; honest step: a media join table.
7. **Let the portal draft a Site Request.** The response half already ships. Adding a create sheet (in the Call Sheet / party profile, which already knows consent state and field links) closes a loop that today requires the designer to pick up the phone to ask someone else to pick up their phone.
8. **Surface capture provenance in the Library** (`products.capture_source = 'field_capture'`) so "I shot this at the show in March" is legible six months later.
9. **Decide the flag posture early.** Today `room-file` and `call-sheet` are fail-closed, so most of the existing field surface is invisible to a default designer. A Field Companion that lands captures behind a third dark flag will not be walkable.

---

## 11. Open questions for the orchestrator

1. **Is `field_captures.provenance` carrying `projectId` in practice?** `use-room-files.ts` documents the flat `"siteScanContext.scanId"` key; project memory says project association lives only in `provenance.siteScanContext.*` because `project_id` is NULL by RPC design. I verified the scanId key and the NULL-by-design comment in 00233/00235, but **not** which provenance keys carry a project. D1/D2 (iOS) should confirm the exact key set from `ContextCaptureProvenance.swift`.
2. **Does iOS actually populate `receiving_inspections.photo_asset_ids`?** The Swift receiving feature exists; I did not read it. If it does, there are already unviewable photos in prod.
3. **Should the Field inbox be per-designer or per-studio?** `field_captures` RLS is owner + org; `room_files` delegates to scan visibility. These disagree (G6) and the answer determines whether the inbox is a Desk population or a Studio ledger.
4. **`project_products` vs `project_ffe_items`** — is `project_products` intentionally retained, or is it vestigial? Nothing in the document-era portal reads it.
5. **Is `RoomFilesSection` meant to come back, or be deleted?** It is a complete, tested, unmounted component.
6. **Where do project photos live?** There is no answer in the schema today. This is the one gap that needs a design decision before wiring.
7. **Does the `worktable` flag's Delivery table change any of the above?** I read `table-derivation.ts` and the slot wiring but did not walk the flag-on Delivery composition; project memory says the flag has never been seen by a human.

---

*Read-only survey. No repository files were modified other than this report.*
