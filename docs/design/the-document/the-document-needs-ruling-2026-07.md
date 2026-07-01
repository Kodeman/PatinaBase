# Needs a Ruling — 2026-07-01 (from the parity re-sweep + live walk)

_Every reconception or reduction the re-sweep could not tie to an existing ruling ID, plus the walk's two design questions. 45 matrix rows + 2 walk items. Grouped by the track that would build them; each carries the verifier's drafted question. Rulings resume at **R73** (DECISIONS.md last id = R72). Companion to `the-document-parity-backlog-2026-07.md`._

## From the live walk

- **WALK-F7** · No-login household send path · _P0_ — The send sheet's ClientPicker silently refuses rows without a Patina account (`client-picker.tsx:209` `linkable` gate); a captured household (R46/R62's normal case) can never be linked, so discovery-born proposals cannot be sent. What is the ruled path — invite-on-send, email-send without `client_id`, or a "paper client" identity? (The same gate blocks decision authoring for profile-less clients — systemic, per the DEC verifier.)
- **WALK-F2b** · The error surface · — Failures render as red toasts (Begin-the-Direction failure; edge-fn failure duplicating an inline notice), against D2's no-toast law. What is the Document's ruled error grammar — margin item, inline band, or a sanctioned toast exception for hard failures?

## Money & time (Track 8 territory)

- **BIL-03** · Invoice Line Kinds (Billing Types) · _ABSENT·P0_ — Where does non-milestone invoice authoring (time / FF&E / ad-hoc line kinds, 00178+00187) live in the Document — the Account Page, an R40 composing page, or a retained composer?
- **BIL-04** · Unbilled Time Pull-Through · _ABSENT·P0_ — Hours ledger's 'Export week → Accounts' button is still a disabled stub titled 'Arrives with the Accounts book (Slice 6)' though the Accounts book shipped (R36) — what is the ruled time→invoice pull-through in the Document?
- **BIL-05** · FF&E Item Invoicing (W3-T4) · _ABSENT·P0_ — What is the Document home for FF&E-line invoicing (the old ?ffeItemIds= prefill + invoiced/paid/unpriced coverage check on 00187) — an act on the FF&E section, the Account Page, or elsewhere?
- **BIL-11** · Project-Level Time Ledger · _ABSENT·P1_ — Does D9's 'review in the drawer' deliberately retire the project-scoped time ledger (/portal/projects/[id]/time — entries, per-project unbilled balance, delete), or does a project Hours view belong in the document (Account band / Work)?
- **BIL-12** · Time Entry Deletion · _ABSENT·P1_ — May a completed unbilled entry be deleted from the Hours ledger (old portal had delete-with-confirm), or is adjusting duration/activity (D10 'adjustable') the only sanctioned correction?
- **BIL-13** · Invoice Filtering & Search · _ABSENT·P2_ — Should the Accounts Ledger page carry status filters (draft/sent/paid/void/overdue), or is the unfiltered newest-first book + Receivables-as-the-open-slice the ruled shape?
- **PRJ-14** · Time tracking ledger: log hours, view unbilled balance · _PART·P1_ — Should the Hours ledger carry history beyond the current week plus an unbilled balance and a bill-it handoff (into Accounts / the Money margin), or is time-billing intentionally left in /portal/billing until that zone dissolves?

## Vendors & procurement (Tracks 9 / 11-M)

- **PRC-03** · Add Custom Vendor Form · _ABSENT·P0_ — Which Document surface creates a new vendor — the People Room '+ Add' growing a maker path, or the Orders book Vendors page?
- **PRC-01** · Vendor Directory: Search, Filter, Save · _PART·P1_ — Where do vendor save/unsave and category/search filtering live in the Document — the Orders book Vendors page or the People Room maker roster? (R5 sanctions the pane; nothing sanctions dropping the save act.)
- **PRC-02** · Vendor Detail: Profile, Products, Reviews, Quote Request · _PART·P1_ — Do vendor products, individual reviews, and the request-quote flow get a Document home (vendor book page or maker profile), or are they retired?
- **PRC-07** · Log Acknowledgment Popover (Vendor ACK) · _ABSENT·P1_ — Where does logging a vendor acknowledgment (phoned/emailed acks) live in the Document — the ledger PO row, the line unfold, or is manual ack intentionally retired?
- **PRC-11** · Damage Claim Drawer: Claim Creation & Vendor Notif · _PART·P1_ — Does the damage-claim vendor-notify/resolution lifecycle get a Document home (Orders book Receiving), or stay portal-only?
- **PRC-12** · ETA Quick-Edit Drawer: Inline Confirmed ETA Update · _PART·P1_ — Where does a single PO's confirmed-ETA edit live in the Document — the unfold's Movement cell, the ledger row, or the Week page?
- **PRC-24** · Order Assistant: Multi-Step PO Creation Workflow · _PART·P1_ — Should the Document compose multi-line vendor POs (e.g. from the Orders book vendor page or a section-level act), or are single-line POs the intended grain?
- **PRC-27** · PO Send Actions & Send Mode (Preview/Send/Mark Sent) · _PART·P1_ — Does 'mark as sent manually' (phone/fax/trade-portal orders) get a Document home in PoPreview, or is manual sent-stamping retired?

## Project lifecycle & the Amendment (Track 7)

- **PRJ-01** · Create new project via 7-step activation wizard · _PART·P1_ — The sanctioned reconception (I35: sign_proposal 00210 p_auto_activate → project auto-opens; Drafting Room R42-R45; doorway chain verified end-to-end) covers only the proposal-born path. Two old-wizard sub-functions have no Document counterpart and no ruling sanctions dropping them: (1) manual no-proposal project creation (the claim's own dataParity admits it — only /portal/projects/new can create one; section-derivation.ts:128 merely renders manual projects); (2) the Step06 client-visibility-tier choice (persisted at new/page.tsx:71,84; the Drafting Room's eight facets carry no access/visibility facet and no Document setter exists — only portal client-view-toggle.tsx:26). Additionally the retained I7 safety-net Desk folder ('Signed — open the project', desk-derivation.ts:369-378) links /doc where ProposalWatch renders only a 'the project is open' seal (proposal-watch.tsx:133-145) with no activation act, and no designer-portal consumer of useSignProposal/activation exists — a dead end if auto-activation was deferred/failed. Missing sub-functions cap the row at PART; the unsanctioned drops need a ruling. P1 not P0: the core lead→proposal→project loop completes in-Document via the sanctioned sign path.
- **PRJ-04** · Scope Change Request list with status tracking · _ABSENT·P1_ — Where do scope change requests live in the Document — a seventh margin kind, an Account-band line, or a coordination item shape — and is a status-tracked list needed at all, given R14 only ruled the note→draft-SCR escalation?
- **PRJ-05** · Create new scope change request: form with impacts · _PART·P1_ — Does a Document-side SCR need the impacts (fee/timeline) grammar and a send act, or is the R14 draft escalation intentionally the whole in-Document surface?
- **PRJ-06** · Review scope change request and apply/send to client · _ABSENT·P1_ — What is the Document act for reviewing/sending/applying a scope change (especially one escalated from a note)? Today the R14 escalation produces a draft that only /portal can advance.
- **PRJ-12** · Bulk archive projects to on-hold status · _PART·P2_ — Is bulk hold/archive intentionally outside the Document's grammar (no list to select from), or should the future cabinet / ⌘K carry a batch act?

## Proposal depth

- **PRO-01** · Create New Proposal from Template · _XFRM_ — Are proposal templates (useProposalTemplates) and an ad-hoc 'new proposal without a lead/discovery walk' intentionally retired, or do they need a Document home (e.g. a ⌘K act for an existing relationship)?
- **PRO-03** · Section Editing: Space Plan (Floor Plan Upload) · _ABSENT·P1_ — R43 sends space-plan uploads to the Folio (R24), but the Folio mounts project-only — should the Folio mount on proposal documents, and should its files reach the client's proposal copy (metadata.floor_plan_url parity)?
- **PRO-07** · Section Editing: Terms & Signature Block · _PART·P1_ — Is the free-text proposal terms/agreement body (old TermsSection, still client-rendered) intentionally retired in favor of change-order terms only, or does it need a Drafting Room home?
- **PRO-25** · Proposal Preview (Client-Facing Read-Only) · _XFRM_ — The client portal's real copy itemizes line prices and payment schedules while the R43 mirror shows only one rolled-up total — which is canonical for 'Preview as the client', and should the two converge?

## Decisions

- **DEC-03** · Delete decision (destructive) · _PART·P2_ — R55's lifecycle lists 'delete (destructive)' but the built surface is draft-only — should a published/pending/expired decision be deletable from the Document, or is post-publish delete deliberately /portal-only?
- **DEC-11** · Reopen / recover expired decisions · _PART·P1_ — Should the margin's Extend on a stored-expired decision run the spine's expired->pending recovery (useUpdateDecisionStatus) so the client can respond again, or is expired-recovery deliberately /portal-only? (R56 sanctions extend+nudge only 'when pending or overdue'.)

## Library, teaching & help (Track 11-R)

- **LIB-01** · Bulk Import (CSV/XLSX) · _ABSENT·P1_ — Bulk CSV/XLSX import has no ruled Document destiny (absent from R5's O5 list and from R32/R39's Library Room contents) — Capture-sheet mode, Composing-Page variant, quiet exile, or retire?
- **LIB-02** · Product Detail (Viewed & Edit Mode) · _PART·P2_ — Piece Room evidence and doorway (/desk → drawer/⌘K → /library → LibraryCard link → /library/[id]) all verified, and R70 genuinely sanctions the reconception (self-save facets, specimen sheet, catalog rails). But sub-function enumeration of /portal/catalog/[id] finds PairsWith — real add/remove of product_relations rows via useProductRelations (direct Supabase, pairs_with/alternative/never_with) — with ZERO Document counterpart (grep 'relation' across components/document/ + app/(document) hits nothing product-related). R70's scope ruling covers only 'columns that genuinely exist on the products row'; product_relations is a separate live table, so this drop is unsanctioned. Missing sub-function caps the row at PART. Everything else is covered or explicitly ruled out (weight/finish/assembly = R70 phantom fields; Cmd+E/Cmd+S dissolved by the ruled save model; DesignerIntelligence's teaching goal covered by the eye Movement + DeepAnalysisSheet).
- **LIB-04** · Categories (Read-only List) · _ABSENT·P2_ — Does the category-taxonomy browse (list with counts) need any Document home after the Products-zone dissolve, or is taxonomy admin-portal-only? (Not covered by R5's destinies or R32/R39.)
- **LIB-05** · Collections List · _ABSENT·P2_ — Collections (curated product lists) have no Document destiny — do they become shelf groupings/pinned sets in the Library Room, fold into projects, or retire? (Absent from R5 and R32/R39.)
- **LIB-06** · New Collection · _ABSENT·P2_ — Same cluster as LIB-05 — collections creation has no ruled Document destiny.
- **LIB-07** · Collection Detail (View & Edit Products) · _ABSENT·P2_ — Same cluster as LIB-05 — collection membership management has no ruled Document destiny.
- **LIB-08** · Edit Collection Metadata · _ABSENT·P2_ — Same cluster as LIB-05 — collection metadata editing has no ruled Document destiny.
- **LIB-10** · Validation Queue · _ABSENT·P1_ — Does the Aesthete validation loop (Agree/Disagree on proposed styles) fold into the Library Room — e.g. a card state or librarian ask — or retire? R32/R39 dissolve the Teaching Queue page but never mention validation, and useSubmitTeaching still routes taught products to status 'needs_validation' (use-teaching.ts:619) with no Document-side consumer.
- **LIB-13** · Patina Catalog (Catalog Layer) · _PART·P2_ — Does the 'For your active projects' catalog-matching tab need a Document home (e.g., an Engine ask preset or a shelf lens), or does R38 ask-and-place cover the goal?
- **LIB-15** · Help System Integration (Ambient & InfoIcons) · _ABSENT·P1_ — Where does the ambient help layer (@patina/help-system SurfaceKeys / InfoIcons / Sanity content) live in the Document — and what is the 'help affordance' that R5's 'Resources → quiet exile behind the help affordance' hangs behind, given none exists in the (document) shell?
- **LIB-17** · Designer Notes (Teaching Context) · _PART·P2_ — Should the Deep Analysis sheet carry the key-features / best-context / avoid-when teaching-notes fields (today the portal collects them but useSubmitTeaching silently drops them — a no-op), or does the Piece's persisted usage_notes facet subsume them?
- **LIB-27** · Quick Tags (Teaching Flow) · _PART·P2_ — built, live doorway, same mutation — but not equivalent depth: the portal quick page submits MULTIPLE style tags in one act (selectedStyles[] → useAssignStyle per style, first primary — quick/page.tsx:25,35-48), while the Document's InlineQuickTags saves exactly ONE style, always as primary (library-card.tsx:179,182-186); a repeat inline act REPLACES the primary (useAssignStyle unsets the prior primary, use-teaching.ts:304-310) so multi-tag accumulation on an existing piece is impossible inline, and the Deep sheet caps at primary+secondary. No ruling speaks to tag arity (R32/R40 name the act, not its narrowing), so this is an unsanctioned reduction → PART + needsRuling. The claim's other noted difference (archetype-subset vocabulary) is defused: migration 00006 seeds all 12 styles with is_archetype=true, so useStyleArchetypes returns the identical set useAllStyles would. P2: off the core loop; Deep sheet (2 styles) and /compose (multi-select for authored pieces) are in-Document workarounds.
- **RMS-11** · Help Center (Main) · _ABSENT·P2_ — R5 exiles Resources 'behind the help affordance' (DECISIONS.md:160) but no ruling defines any help affordance in the Document — what is Layer-4 reference help's home (a CommandK entry, a margin affordance, or nothing)?

## People & CRM

- **CRM-20** · Lead Intake & Matching · _PART·P2_ — R61 states a passed lead 'stays in People as declined', but people_directory (00221:85) excludes declined/expired leads - should declined-lead history get a Document home (directory filter or People view), or is /portal/leads sanctioned as its archive?

## Account & settings

- **RMS-07** · Notifications Settings (Detailed) · _PART·P2_ — Account·Notifications ships 4 of ~17 notification-type toggles and omits digest frequency and per-thread mute/overrides from /portal/settings/notifications — is the four-toggle scope ruled, or must the full set fold into the sheet before the portal page dissolves?
- **RMS-09** · Profile Page · _PART·P2_ — Does the Account sheet need the /portal/profile active-sessions list + 'Sign out other sessions' (/api/me/sessions), or does session management retire with the portal page?
- **RMS-10** · Preferences Page (Unsubscribe & Digest) · _PART·P2_ — Where does digest_frequency live in the Document model, and does /portal/preferences survive the dissolve as the standalone email unsubscribe-link landing?

## Rooms

- **RMS-02** · Room Detail + 3D Scan Viewer · _PART·P1_ — Should the Document's scan affordance (letterhead instrument / Discovery folio) open the interactive 3D RoomScanViewer from /portal/rooms/[id], or is the image-grade DocFileViewer the ruled scope and the 3D viewer retires?

## Document-native

- **NAT-23** · Capture front door (＋ Capture a lead / ⌘K new-lead) + people rows in ⌘K (R62/R65, Track 6 G1+G3) · _NATIVE_ — R62 ruled ⌘K returns 'jump to [person]' rows, but the implementation pushes /people without deep-linking to the named person (command-bar.tsx:205-207 notes the missing ?person= param) — is landing on the People Room acceptable or must the row land on the person's profile?