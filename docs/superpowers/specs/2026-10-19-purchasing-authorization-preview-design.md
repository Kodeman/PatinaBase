# Purchasing Authorization Preview

**Status:** Implementation and production delivery authorized by the user on 2026-10-19: “assemble a team to deliver this preview functionality to production.” Architecture preflight, independent acceptance and verification remain required before release.
**Date:** 2026-10-19
**Story:** US-40

## Intent

Let a designer read the purchasing authorization the client will receive before choosing to send it. The existing item-selection review is useful but is not the client's document presentation.

This serves The Document at the studio's final purchasing review, supports project furniture revenue, and preserves deliberate, designer-controlled outbound communication.

## Recommended flow

```text
Select items → Review selection and deposit → Save draft & preview
                                                   ↓
                                  Client-facing authorization preview
                                   ↙             ↓              ↘
                              Close draft    Send to client    Back to review
```

An existing saved draft also has a **Preview** action in its authorization detail.

### Review and save

- Keep the existing item-selection, deposit, agreement and checkpoint checks.
- Name the forward action **Save draft & preview**. Do not describe it as a read-only preview: creation persists an authorization snapshot and reserves its schedule lines.
- Explain beside the action: **Saving creates a draft and reserves these items. Nothing is sent to the client.**
- Retain a separate save-and-close path if the existing flow needs it; it uses the same creation operation.
- Save once, retain the returned document identity, then read its persisted snapshot for preview. Do not render an optimistic draft as the final client document.
- If saving fails, keep the selection and terms available with a useful error. If saving succeeds but preview loading fails, retain the draft ID and offer a preview retry, not another creation.

### Preview

- Show the real client-facing authorization body, using shared presentation and client-safe data rather than a designer-only lookalike.
- Derive studio preview chrome from persisted state: **Preview · Not sent** only for a loaded draft, neutral while loading/error, actual state for sent/terminal documents. Do not add studio chrome to the client's actual document.
- Include the same room grouping, item names, quantity/unit presentation, client prices, allowance treatment, totals, deposit and client-visible terms as the client view.
- New saved authorizations freeze `snapshot.clientImage={version:1,url:string|null}`. Choose the item's primary in 00807 ordering; use catalog fallback at save only when no item-owned image row exists. Invalid own images freeze explicit null, never another photo. Preserve existing snapshot keys and fingerprints of historical documents. Both safe projections/adapters and the shared body use only this optional field, never live catalog substitution. Absent legacy fields retain image-less presentation; existing drafts needing photos require explicit Void(reason)/new draft.
- Accept HTTPS only (HTTP solely for explicitly local test/development hosts), without credentials, non-web schemes, private signed storage or recognizable expiry signatures. No arbitrary server fetch or private signer. Render bounded object-contain images with frozen-description alt, lazy/async loading, no-referrer and per-source failure reset; distinguish missing from unavailable images. The selected URL reference is frozen, not guaranteed immutable image bytes.
- Opening, closing or reopening a saved preview is read-only. Closing leaves the draft and its reservations intact.
- The designer can return to review without mutation. Frozen authorization lines cannot be edited. To change them, use the existing explicit **Void** action with its required reason, then prepare a new draft and preview its new ID. Do not add an editing or implicit replacement workflow.
- Do not show internal costs, trade pricing, markup, margin, operational notes or authority metadata.

### Final send

- Provide a distinct **Send to client** action on the preview. No opening, saving, closing or scrolling action sends anything.
- Show the existing recipient information beside the final action; this feature does not add recipient editing or an email composer.
- Send the persisted authorization and the content version actually reviewed. A freshly fetched fingerprint must not silently authorize a changed, unreviewed document.
- Reuse the existing send transition, agreement/checkpoint checks and notification path. Loading, invalid data, changed content and failed checks keep Send held.
- If data changed, explain what needs review and require the designer to load and inspect the updated preview. The send RPC reports deliberate fingerprint conflicts as `PT409` (HTTP 409); the preview also holds legacy `40001`/`serialization_failure` and unavailable `42501` responses during rollout. No automatic retry, replacement review token or delivery follows a refused transition.
- Preserve retry identity: a failed send never creates another authorization. Distinguish a failed document transition from a notification failure after the transition, and follow the existing retry behavior rather than inventing a second sender.

## Privacy and authority

- Unsent drafts remain unavailable through the client document API.
- The preview uses an authenticated studio-authorized read, not a public client link or an impersonated client session.
- Existing project/studio boundaries remain enforced server-side.
- No signature, acknowledgement, billing authority, checkpoint override or purchasing approval is created by preview.
- No external communication is sent during implementation verification unless separately authorized.

## Scope and non-goals

In scope: shared client-facing document presentation, a safe draft read where the existing read is incomplete, preview entry points, explicit saved-preview-send state, stale-content protection, accessibility and focused regression tests.

In scope under US-40 decisions #2–#7: project-owned save completion across sheet dismissal, persisted-state chrome, narrow dead-presentation removal, frozen item-photo references in both client and studio bodies, actionable working-budget navigation and a focused client published-checkpoint review at Threshold #ledger.

A checkpoint is nonbinding spending-plan alignment, not another agreement, purchasing authorization or payment. No working version offers **Set up a working budget**, unfolding Money via `requestRegionUnfold('money')` and `ceremony.backToSelecting`, preserving the selection and durable focus. Distinguish first publication, update/stale coverage, awaiting actual client acknowledgement, loading and read failure. Never republish a covering checkpoint merely for outstanding acknowledgement. Reuse existing sync/publish/review interfaces; do nothing automatically. External-recorded-only publication sends no budget email.

The client review reuses `useProjectWorkingBudget` and `useAcknowledgeBudgetCheckpoint` at the existing ledger destination. Display only coherent published client-safe version lines/totals and their checkpoint identity; hold on mismatched/stale/unavailable state. Only explicit client click acknowledges that displayed checkpoint. Preserve exact-client/latest/fingerprint server guards and isolate project changes. Any missing safe read seam requires a ruling before server changes.

Out of scope: purchase-order preview; image archival copying/private signing; PDF/export; email preview/composition; signature simulation; agreement capture changes; new services or dependencies; automatic sends or overrides; replacement of the commercial-document lifecycle; broad portal redesign.

The external signed-agreement work in US-39 remains separate. Implementation must start after its accepted changes are integrated, because both features touch the authorization review and commercial hooks. Its external-only checkpoint behavior and purchase-authority guards must remain intact.

## Acceptance criteria

1. Save draft & preview creates exactly one authorization and sends nothing.
2. Reopening or closing a saved preview performs no mutation and leaves the draft intact.
3. The preview and client document use the same presentation and snapshot projection, including allowance, room, total and deposit edge cases.
4. Private studio pricing and notes never reach the preview's client-facing data contract.
5. Unsent-client reads and cross-studio reads remain denied.
6. The final Send targets the displayed document/version; a change between preview and send is rejected until reviewed again.
7. Save failure, preview-read failure, send failure and post-transition notification failure have distinct recovery paths without duplicate documents.
8. The sheet works at desktop and 390px, with keyboard focus trapped while open and restored to a durable invoking action when closed.
9. Project/document changes clear the old preview; out-of-order requests cannot show or send another document.
10. Existing Patina and externally recorded agreement paths retain their respective purchasing/checkpoint protections.

## Evidence and limits

Read-only source research identified the current `ReviewReleaseSheet`, saved-draft `AuthorizationDetail`, client `FurnishingsBody`, client draft-read denial, and existing send retry handling. This is source evidence, not a completed browser walk or passing verification of the proposed feature. Exact implementation boundaries and executable gates are in the companion plan.


## Settled deposit correction — 2026-10-19

US-40 story log revision 1 / SQ-1426 ruling `c_mvfmsx6k_aad247`: the client reader may prefer an unfingerprinted linked invoice amount. Both the saved preview and actual pre-signature client body therefore derive contractual deposit with `round(document.totalAmountCents * document.depositPercent / 100)`. The shared body owns that rule. Only the executed client body may retain its existing invoice-backed amount; executed payment/deposit handoff stays unchanged. Preview excludes invoice-backed amounts and depositPaidCents. Add deliberately mismatched invoice parity and executed-handoff preservation assertions. No client-reader rewrite, helper RPC, fingerprint expansion or billing lifecycle change.
