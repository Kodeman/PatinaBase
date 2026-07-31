# Spec Book production readiness checklist

Spec Books ship as a generally available production capability. The schema is
additive; rollback is a redeploy of the prior application/function versions,
with any database remediation handled by a forward migration.

## Fixture

- [ ] One representative studio account.
- [ ] One live project with at least three rooms.
- [ ] Fixed items, one allowance, and one TBD.
- [ ] One Product master reused by two FF&E lines with different project finishes.
- [ ] At least one deliberate missing-field blocker and one warning.
- [ ] Client, vendor, installer, internal, and care artifacts requested.
- [ ] One post-issue selection change followed by a changed-items-only addendum.

## Capture and specification

- [ ] Designer Piece sheet can fill an existing slot and create a new line.
- [ ] Chrome capture preserves sticky project/room context across a panel reopen.
- [ ] Chrome failed placement preserves the Product and exposes retry.
- [ ] Patina Field failed placement preserves the committed capture/Product and
      exposes retry from its outbox.
- [ ] Duplicate Product reuse creates distinct `project_ffe_specs` rows.
- [ ] Editing project selection fields does not update `products`.
- [ ] Inherited values show their provenance and follow the frozen precedence.
- [ ] A stale optimistic `row_version` is rejected.

## Preflight and issue

- [ ] Duplicate code, invalid ownership, missing fixed-item requirements, privacy
      violations, and audience-required facts block issue.
- [ ] Allowance and TBD rows use their specialized requirements.
- [ ] N/A and warning acknowledgement require a reason.
- [ ] Repeating an idempotency key returns the existing revision.
- [ ] All five PDFs render independently and each artifact can retry in place.
- [ ] Finalization is rejected while any requested artifact is not ready.
- [ ] Current working values remain editable after issue without mutating the issue.
- [ ] Drift compares against the latest issued item hash.
- [ ] Full replacement and addendum flows both produce correct revision lineage.

## Privacy and sharing

- [ ] Client render model and extracted PDF text contain no trade price, markup,
      private notes, internal contacts, or procurement commentary.
- [ ] Vendor output contains no private notes, internal contacts, or markup.
- [ ] Installer and care outputs contain no price fields.
- [ ] Guest route fetches only `resolve_spec_book_share`; it does not query working
      tables through a service-role client.
- [ ] Valid token resolves only its ready audience artifact.
- [ ] Expired, revoked, malformed, wrong-audience, and non-ready tokens fail closed
      without an existence signal.
- [ ] Revocation invalidates subsequent resolves.

## Accessibility and performance

- [ ] Keyboard-only chapter reorder, item edit, preview, preflight, and issue.
- [ ] Dialog focus restoration and visible focus treatment.
- [ ] Semantic heading hierarchy and announced readiness/render status.
- [ ] Contrast and reduced-motion pass.
- [ ] Responsive workbench at phone, tablet, and desktop widths.
- [ ] PDF text is selectable, legible, and not clipped at page boundaries.
- [ ] Large-book limit fails with an actionable error rather than timing out.

## Evidence

- [ ] `pnpm supabase:reset`, focused SQL suite, and object-level probes.
- [ ] Generated `database.types.ts` is synchronized.
- [ ] Deno render tests and local live function probe.
- [ ] Designer, extension, and client type gates plus focused unit suites.
- [ ] Playwright live-data journey uses web-first waits and `expect.poll` for DB writes.
- [ ] `capture-gate.sh all` passes.
- [ ] Physical-device Patina Field pass uses an explicit UDID.
- [ ] Server-side Product, field capture, FF&E, room, and spec rows confirmed.
- [ ] Production migration, function, portals, and public routes verified after deploy.
