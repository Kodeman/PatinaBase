# Room Proof 08 verification

Date: 23 October 2026. Standalone artifact checks; no production application changes or deployment.

## Browser checks

Chrome through the computer-use browser API, desktop at 1440 × 1000 and phone at 390 × 844; the normal viewport was restored afterward.

- Studio, presentation and job load with local fonts/assets. Studio and presentation page width remains 390 on the phone.
- Dense FF&E: 36 starting living-room lines / 80 job lines, six lenses. On the phone the table scrolls inside its container (388px viewport / 680px table), without page overflow. Desktop pricing instrument inspected.
- Library handoff creates LR-37 as an unpriced candidate, giving 37 living-room / 81 total lines; original LR-01 remains unchanged. Handoff query is removed after placement to avoid duplicate creation on reload.
- Added 0.5h billable time appears in job and studio books. A $453.75 draft allocates the seeded and added billable entries without changing $8,400 issued / $6,000 received / $2,400 outstanding.
- Final reversible-draft check: seeded $371.25 invoice draft voids and returns its two entries to unbilled time.
- Studio correspondence draft appears on its job subject. CP-01 note appears in studio correspondence. Explicit client draft shows “To Nora & Eli · not sent”; GC and supplier received messages retain their audience.
- Shared reset restores all eight original/received correspondence records and the 80-line sample. Temporary job edits were reset before delivery; founder review notes have separate storage.
- Exact PO-02 link opens PO-02 / Northline / upholstered bed, not PO-01. Return link opens the originating Studio Books order register.
- Changing only the fabrication instruction role leaves the full-service cover unchanged, shows an unsigned proposal and identifies both held GC appointment and proposed studio owner. Held IS-03 still includes KS-101/B. Original frozen draft contents survive later setup changes.
- Required client acceptance examples: no response, returned item, one signer and open studio obligation hold completion; the fully accepted later fixture enables a preview. An unsigned service proposal keeps completion held.
- Care-book LR-05 and A-201 links return with focus on care-work, restore #closeout, and fold the drawing bench. Browser observation confirmed care-work at approximately 65px from the viewport top after return.
- Founder review text restores after reload. Markdown download files were observed in Downloads. Two-step clear removed verification-only review text without changing job data.
- No browser console errors were observed in the checked studio/job/presentation flows.

## Artifact checks

All fourteen JavaScript files pass `node --check`. Static HTML resource and CSS asset checks found zero missing files. HTTP probes returned 200 for index.html, studio.html, job.html, whole-data.js, COLLABORATION.md and VERIFICATION.md. Independent Claude reports and the disposition of findings are included in COLLABORATION.md.

Screenshots: [studio desktop](screenshots/studio-desktop.jpg), [studio phone](screenshots/studio-phone.jpg), [dense room pricing](screenshots/sheet-desktop.jpg), [room sheet phone](screenshots/sheet-phone.jpg), [cabinet package](screenshots/cabinet-desktop.jpg).

## Limits of verification

This was focused integration and visual verification, not exhaustive testing of every inherited FF&E action or a production security/accessibility audit. Some browser automation calls needed fresh state or a fresh tab; the founder download completed and was checked on disk. No application-wide build, database, service or deployment checks were needed because only standalone presentation artifacts changed.
