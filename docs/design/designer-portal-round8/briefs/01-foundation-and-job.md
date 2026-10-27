# WP-01 / composition part of WP-03 — one paper foundation

**Direction:** approved Room Proof 08 governs this program’s look/flow; current source and domain rules govern existing behavior. Follow FOUNDER-DIRECTION precedence. Resolve only the concrete P01/P02 conflict before its dependent change; continue unaffected work.

**Outcome:** approved editorial studio/job composition around current providers, identity and instruments. First prove the live studio→job→line→return slice.

Read DESIGN-CONTRACT, CODEBASE-MAP, C1/C2/C3 and A01–A04/X01/X04–X06/X09. References: round-eight studio.html, job.html, studio.css, job.css and whole.css; do not import their JavaScript or style globals wholesale.

## Entry points and ownership

Foundation owns a scoped semantic mapping in `apps/designer-portal/src/app/globals.css` and affected existing document primitives, after P01/P02. Integration lead owns `(document)/layout.tsx`, `doc/[id]/layout.tsx`, `doc/[id]/page.tsx`, `lib/document/registry.tsx`, `document-index.ts` and shared route/provider wiring. Coordinate every shared-file patch. Use `DocSheet`, `useDocumentRunningIndex`, `room-origin`, buffered saves and existing return helpers.

## Required behavior

- Preserve DocumentTimeProvider, mobile/help/walkthrough providers, the bare-board boundary, root session/query isolation, DeskDoorway’s final mount order and all singleton global overlays/services. One continuous document remains mounted during dense work and global ledger visits.
- Desktop left-weighted image/paper with contents/next-act margin; phone stacks useful content and retains reachable contents. No nested card hierarchy or permanent global nav inside the job.
- Ten proposed chapters map to actual existing mounted regions and lifecycle. A lead, design-only engagement or empty room must not show invented completed sections.
- Return restores identity/room/lens/filter/selection/scroll/focus. Handle an origin that was removed or access-revoked. Back/Forward/reload do not replay actions.
- Foundation owns A03 lineage/early-job acceptance; build domain owns A04 service composition. Early brief/agreement presentation uses actual lineage and effective scope; configurable service controls consume the C2 contract, not browser-local truth.
- Loading, save/error/retry and access-loss states are designed with the same hierarchy as the happy path.

**Out of scope:** creating another job/document store, replacing data hooks, moving all domain code out of the large page in one refactor, reviving retired routes/flags, or changing other portals' theme.

**Gates:** designer type-check and lint; relevant contrast/shadow/return unit contracts; quiet-responsive-shell, margin-handoffs and error-state tests; desktop and phone live-data walkthrough with keyboard and reduced motion. Show computed type/spacing against the approved reference before feature teams build new components on it.
