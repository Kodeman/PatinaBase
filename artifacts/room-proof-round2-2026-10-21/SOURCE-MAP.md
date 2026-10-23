# Current capability → Room Proof

Read-only source audit of Patina at commit `98c6baa69`, 21 October 2026. This establishes what is implemented in the checkout, not which flags, permissions or integrations are enabled in production.

The current portal is Document-native. The earlier `(portal)/portal` route tree is absent from this baseline; July skill routing notes were not treated as current navigation evidence. The prototype follows the current project document and studio books.

## Detailed evidence

- [Core project, engagement, approvals and schedule](core-evidence.md)
- [Library, configuration, orders and specification](sourcing-evidence.md)
- [Studio, contacts, finance, time and inbox](studio-evidence.md)
- [Interactive capability map](index.html#mapping)

All source paths below are relative to `apps/designer-portal/src/`.

## Navigation and placement

`app/(document)/layout.tsx` mounts the studio drawer, command access, account/help surfaces and document overlays. `components/document/studio-drawer.tsx` opens full rooms for the library, people and rooms, and book sheets for orders, accounts and hours. `lib/document/document-index.ts` establishes the project’s core regions: client approvals, schedule, pieces, financials, closeout and record, with discovery and agreement-related regions before project work.

Room Proof proposes a persistent, restrained studio footer and a visual room entry with numbered pieces. These are design treatments of the existing work, not existing room-photo placement or capture behavior. The complete product navigation and account system are not rebuilt in this artifact.

## Source-backed features mapped beyond the working specimen

- **Measured rooms:** `components/room-file/room-files-section.tsx:31` lists scan-backed room files. No scan data or measured drawing is fabricated in the sample.
- **Plans and issued revisions:** `components/document/plans/plan-room-workspace.tsx:41` and `plan-issue-ceremony.tsx:87` cover working plans and issue. The sample does not upload, render or distribute plan files.
- **Account:** `components/document/account/account-profile-page.tsx:35`, `account-security-page.tsx:27` and `account-notifications-page.tsx:94` establish the personal surfaces, alongside help and command infrastructure in the Document layout.
- **Client notes:** `components/document/client-note-composer.tsx:232` gates the note composer; the implementation includes selected document enclosures and explicit send. Local reply drafts in this specimen are not that full composer.
- **Relationship growth:** the people workspace includes outreach campaigns, audiences, templates, portfolio, reviews and nurture. These are existing source capabilities with proposed placement under Studio contacts, not “coming soon” features.
- **Full invoicing/time:** additional invoices, voids, payment links, delivery recovery, aging, Earnings, timers, colleague rollups and exports remain mapped. The working example follows one service invoice without overwriting its history.
- **Full sourcing/procurement:** real scraping, spreadsheet import, maker compatibility evaluation, modular composition, quote upload/application, change orders, multi-project placement and fulfillment integrations remain mapped.
- **Specification editions:** audience selection, preflight, artifact rendering, freezing, addenda, revision history and sharing are present in source. This specimen offers a shared print preview only; printing is not an issued artifact.

## Gates retained as uncertainties

The source includes `studio-workspaces`, `agreement-parts`, `agreement-library`, `design-build`, `outbound-review`, `worktable`, client-note threshold and other feature gates. Their live values were not queried. The design does not claim all gated sections are universally available today.

## Sample boundaries that affect the review

1. **Design vs money:** a design approval does not grant purchasing authority. A received deposit does not allocate money to a PO. The Northline order remains held; no release is simulated.
2. **Versions:** approval is tied to an issued sample edition and a frozen reviewer set. A scope change invalidates current approval without erasing old evidence.
3. **Two project contexts:** Lake Mendota House carries the design/purchasing example. Oak Street Apartment supplies a separate, previously released order for receiving and claims. Its shipment is not evidence that Mendota’s held pieces shipped.
4. **Price:** catalog prices are sample retail/client prices and trade costs. Freight and 5.5% tax are illustrative estimates. The furnishing budget excludes design services.
5. **Private data:** the shared spec book omits trade cost, margin, private notes, COM acceptance notes and maker correspondence. It does not expose hidden fields by switching roles; there is no production access-control system here.
6. **Imagery:** the generated room and chair are concept illustrations. Other pieces are outline studies. Material finishes require physical samples and maker confirmation in actual work.
7. **Schedule:** the installation date is a target, not a supplier promise. The sample illustrates date-edit rules; it does not calculate all procurement lead-time dependencies.

No application code, backend, environment configuration, production data or deployment was changed.
