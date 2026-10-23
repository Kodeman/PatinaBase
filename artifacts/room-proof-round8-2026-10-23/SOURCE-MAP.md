# Round eight — capability and evidence map

23 October 2026. Repository baseline `ee9c450a582bc677a635a7e451425db4e1e51b4a`. This is source inspection and design synthesis, not a live production audit or practitioner interview.

## Whole-portal source foundations

Paths are relative to the repository. `D/` = `apps/designer-portal/src/components/document/`; `L/` = `apps/designer-portal/src/lib/document/`.

| Foundation observed | Source evidence | Round-eight placement |
| --- | --- | --- |
| Document-native Library, People, Measured rooms; studio Orders, Accounts, Timesheets, Inbox | `L/registry.tsx:90–151,169–261`; `D/desk-contents.tsx:279–417` | Studio desk and resource views; studio books reconnect to the same job records. Measured-room evidence is demonstrated inside the deep job, not as a complete global scan catalog. |
| Inquiry/direct project, services agreement, invoice, time and maker capture actions | `L/registry.tsx:269–367`; `D/overlays/capture-lead-sheet.tsx:41–46` | Inquiry register and retained origin history; service configuration and baseline agreement on the job. Other inquiries remain illustrative records, not fabricated full projects. |
| Services agreement is distinct from design proposal | `L/registry.tsx:298–317` | SA-014 baseline versus service proposal and individual design review editions. |
| Brief, Discovery, approvals, rooms, FF&E, Care, Account and Kickoff in the document | `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:3632,3749–4019` | Continuous paper, early scope through care and retained record. |
| Preliminary selections, specifications, pricing, purchasing authorization, separate finish schedule | `D/pieces/build-room-shell.tsx:80–98`; `D/ffe-section.tsx:1227–1269` | Native 80-line sheet with 36 living-room lines, filters, edits, pricing, COM/labor, item decisions and finish surfaces. |
| Orders register, weekly orders, receiving, vendor accounts; released/ordered/received/claimed lines | `D/orders-ledger.tsx:63–68`; `D/ffe-section.tsx:229–305,369–374` | Job purchasing and studio order book use the same local order records. Exact order deep links, acknowledgment and receiving remain in the working sheet. |
| Correspondence versus activity log; people relationship views | `D/overlays/post-sheet.tsx:60–65`; `D/people/people-room.tsx:634–677` | Studio correspondence, scoped job notes and activity remain different. Job-linked studio drafts are stored with the job subject; package notes use CP-01. |
| Accounts ledger, receivables, earnings visibility and invoice folio | `D/accounts/accounts-book.tsx:52–55,149`; `D/accounts/accounts-receivables-page.tsx:34–96` | Issued service fee, receipt, balance and unsent time-invoice drafts. This mockup does not model all permissions, tax or reconciliation rules. |
| Time scopes, billability, rate provenance and invoice linkage | `D/hours-ledger.tsx:1501–1506,2099–2197,2312–2335` | Time entry → invoice draft → studio books. Internal time does not become billable; drafts do not change issued balances. |
| Personal unreviewed captures, studio products and trade catalog | `D/rooms/library/library-room.tsx:39–56` | Library shelves and references; one native chair-to-room candidate handoff. Full capture/import and catalog services are not implemented. |
| Team membership, roles, defaults and dated rates | `D/account/account-studio-page.tsx:1501–1626,1633–1834` | Quiet studio membership/settings reading; local display preferences only. |

The older portal-features skill describes a zone route tree that is absent in this checkout. Actual source is document-native (`/desk`, `/doc/[id]`, `/library`, `/people`, `/rooms`, `/boards`); the design uses the inspected source rather than asserting the stale route structure.

## Native work retained from the approved studies

- Round three: continuous job paper and dense schedules.
- Round four: item-by-item decisions, private/client/maker correspondence, separate purchase authority/funding, order drafts, acknowledgements and receiving.
- Round five: room survey, concept, drawing revisions, immutable drawing-set drafts, Field copy and site returns. Runtime was copied into round eight with its own storage key; primary controls never require earlier rounds.
- Round six: multiple service/practice arrangements and responsibility boundaries.
- Round seven: cabinet design-to-craftsman package, appointment distinctions, changes against held issues, separate trade and studio acceptance, response/returned-item closeout examples.

The cabinet elevation is now **K-201**, with kitchen plan K-101 and maker set KS-101 (or designer details KD-401). Living-room A-201 retains its actual round-five console history. GC-bought CP-01 stays outside the studio furnishing subtotal.

## Cabinetry and acceptance source boundaries

- `packages/supabase/src/hooks/use-product-configurations.ts:251–290,311–350,369–381,443–456`: commission revisions, milestone evidence, drawings/quotes and version-bound changes. Unified CP-01 assembly remains proposed.
- `D/buying/submittals.tsx:17–54,73–88,267–298`: drawings/samples and studio review; does not prove client approval or fabrication authority.
- `D/plans/plan-issue-ceremony.tsx:47–48,116–134,180–231`: issue purposes and exact transmittals; a production purpose is not proof of readiness, instruction or receipt.
- `D/commercial/trade/work-order-sheet.tsx:4–14,61–115`: scoped work copy excluding private markup/bids. The proposed practical cabinet work copy extends the presentation, not the production permission model.
- `D/commercial/trade/trade-scope-detail.tsx:475–524`; `L/project-commerce.ts:748–774,933–955`: trade acceptance distinct from studio substantial completion, with evidence and provenance.
- `D/care-band.tsx:330–350,397–428,515–558`; `L/closure-derivation.ts:22–41,164–308`: project closure/checklist/gates. Required evidenced acceptance of the whole studio service is a founder-directed proposal; it was not established as an equivalent existing gate by this inspection.

## Published process grounding retained from round seven

These businesses describe their own processes. They were not interviewed and do not endorse this design.

- [Ferris Custom Cabinetry — process](https://www.ferriscabinetry.com/our-process): maker drawings, site checking, selections and coordinated installation.
- [Cutting Edge Woodworking — process](https://www.cuttingedge-woodworking.com/company/our-process): field measurement, samples and the engineering/production transition.
- [Sagar Cabinets — designer and joiner collaboration](https://sagarcabinets.com.au/interior-designers-joiners-custom-cabinetry/): design intent, manufacturing information and site coordination.

Accessed during round seven on 23 October 2026. These inform design framing, not construction standards, professional liability or contractual advice. All mockup drawings, prices, identities and evidence are fictional.

## Limits of “complete” in this exercise

Complete means the whole portal structure and its connected representative workflows are present. It is not a production implementation or a full copy of every current control. Lake Mendota is the deep sample; other jobs are scope briefs. Actual scans/CAD, imports, collaborative edits, permissions, invitations, signatures, sends, payments, tax and live vendor integrations are excluded. The review controls for future acceptance are explicitly separate from current-job state.
