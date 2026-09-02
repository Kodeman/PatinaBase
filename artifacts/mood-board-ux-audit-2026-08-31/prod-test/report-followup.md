# Mood Board Prod QA — Follow-up: Proposal-Owned Path (2026-08-31)

Focused cross-check of the main report's P1 findings on the PROPOSAL-owned board path (drafting room "Boards" facet), run on pre-existing legacy fixture proposal `47a36fe9-…` ("New proposal"). Transcribed by the orchestrator from the QA agent's report.

## Verdict table — F1–F4 on the proposal path

| Bug | Verdict here | Endpoint + status | Evidence |
|---|---|---|---|
| F1 blank-board creation | **WORKS** (project path 100% broken) | Board created, room opened, no error | "Blank board" from picker → clean "Board 2" |
| F2 multi-select group drag | **WORKS** | `POST /rest/v1/proposal_board_items?on_conflict=id` → 200 | 3-pin marquee group drag persisted |
| F3 Cmd+D duplicate | **WORKS** | `POST /rest/v1/rpc/apply_board_room_state` → 204 | Note duplicated, count 2→3 |
| F4 Share | **EXISTS here** (absent on project path) | n/a (link not created) | "Share" button in room toolbar → full "Share Board" dialog (label, expiry, create-and-copy) |
| single drag (bonus) | WORKS | `PATCH /rest/v1/proposal_boards?id=eq.{id}` → 200 | left 88→248 top 12→92, persisted |

**Refined hypothesis:** the proposal path uses THREE endpoints by action (PATCH `proposal_boards` for single moves; upsert `proposal_board_items` for group moves; the shared `apply_board_room_state` RPC for add/duplicate). All succeed on proposal boards; only the PROJECT path's calls into that shared RPC fail. So F1/F2/F3 are project-owned-path defects (likely payload/validation mismatches in the project branch), and F4 is a surface gap: share is mounted only on the proposal room toolbar.

## Major new finding — F7 (P1, high confidence)
**No reachable UI path exists in prod to create a new Boards-capable proposal.** Every creation entry (⌘K "Draft a design agreement", Desk "Open the Drafting Room" quick action, full lead→discovery→"Begin the Direction" flow) creates `document_kind='design_services'`, which renders the facet-less `ServiceAgreementDraftingRoom` — **no Boards facet at all** (traced to `apps/designer-portal/src/lib/document/commercial-documents.ts` `commercialDocumentExperience` + `drafting-room.tsx`). The full Boards-capable drafting room survives only on a handful of pre-existing legacy proposals. **Net effect for new work: designers reach boards only through project surfaces — exactly where blank-board creation is broken (F1), group drag fails (F2), duplicate fails (F3), and Share is absent (F4).** The healthy path is stranded on legacy fixtures.

## F8 (P2, high confidence) — URL "unfurl" doesn't unfurl
The add rail's "Quick-create draft" tab has a "SOURCE URL" field, but pasting a real West Elm product URL fetches nothing — no title, price, or image; it's inert text storage. Product name typed by hand; the draft pin shows "No image."

## Cleanup status
- Scratch project "ZZ QA Scratch 2 2026-08-31": ARCHIVED (custom confirmation), verified gone from /desk.
- Owed studio template "ZZ QA Scratch Template 2026-08-31": DELETED, verified gone from picker.
- "Board 2" left on the legacy QA fixture proposal (matches its existing retained-QA-board pattern; boards have no hard-delete).
- **Cleanup owed:** two $0/unsent design-services draft proposals created while hunting for a proposal-creation path: `c66dbc75-8…` (under existing test household kody+datetest@) and `1c99def8-7…` (under new lead "ZZ QA Scratch Household 2026-08-31"). No archive/delete affordance found in-session; zero client/financial impact.
