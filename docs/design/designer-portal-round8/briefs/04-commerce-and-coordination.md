# WP-06 / WP-07 / WP-09 — decisions, buying, communication and books

**Direction:** approved Room Proof 08 governs this program’s look/flow; current source and domain rules govern existing behavior. Follow FOUNDER-DIRECTION precedence. Resolve only the concrete P01/P02 conflict before its dependent change; continue unaffected work.

**Outcome:** operational detail fits the paper while retaining the current stronger commercial and delivery rules. Split these packages into explicit non-overlapping tasks; this brief is not permission for one agent to edit all domains concurrently.

Read C2/C3/C4/C5/C7, A10–A15/A19 and X01–X03/X08–X09. Entry points: `use-commercial-documents.ts`, `use-project-approvals`, `use-procurement`, `use-buying-phase2`, Orders/Accounts/Hours books, DocumentTimeProvider, `use-time-tracking`, margin/coordination/Field components, `post-sheet`, `use-comms`, `use-project-notes` and existing outbound draft/send owners.

## Required slices

1. **Decisions→orders→receipt:** exact item edition and partial response; content drift; authority/funding/terms holds; maker grouping and order identity; differing acknowledgement; partial/damaged receiving, claim and replacement. No implicit fabrication instruction. Keep external buying outside studio payables by consuming the single C5 contract owned by build domain. WP-03/C2/C5 must be ready for external-buying mutations. Existing paid studio store purchases are not GC-owned buying; do not invent a second fulfillment model.
2. **Notes→people→Field:** typed contextual subject, actual audience/recipient, private versus shared attachments, appointment/work copy and receipt history. A Field observation returns to the source scope/issue and named next owner. Directory membership grants no access.
3. **Hours→invoice→accounts:** one timer/manual capture, actual studio/member/project visibility, dated rate provenance and rate-pending state; atomic invoice claim/void/release; correct issued/received/due. Current tax/payment/commercial calculations stay in their owners.

Expose these acts from job chapters and studio books using the same identities and cache fan-out. Drafting does not send. Preserve V22 designer Send and delivery-attempt/provider-outcome/after-send distinctions; unknown delivery does not trigger blind retries. Do not send real client/vendor messages for a test walk.

**Write ownership:** select one domain owner for each commercial/communication hook and mutation; bounded UI teams consume its contract. Existing portal-local commercial hooks are not relocated to shared packages as incidental cleanup. Integration lead owns global overlays and orchestrator wiring.

**Gates:** designer type-check/lint; affected Buying/Hours/Agreement/Field tests using their configs and local profiles; relevant SQL/RLS/authority/claim/idempotency tests; send-authority policy gate. Prove both job and studio readings update, recipient projections exclude private data and a second actor cannot double-claim or overwrite evidence. Preserve existing client/Field consumers.
