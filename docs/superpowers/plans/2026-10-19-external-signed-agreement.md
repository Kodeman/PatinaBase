# External signed agreement implementation

## Goal
Implement approved US-39, story execution contract revision 2 (SQ-1420; SHA `695144f59098c0f8d46cf4357f96d63a7bfb07eca41f981983d594ad67412c7f`): “Upload the actual signed PDF, record its signed date, require explicit designer confirmation it covers this project, then permit the ordinary purchasing-authorization lifecycle.” Implementation does not deploy or touch production.

## Architecture
One immutable project evidence row references a private `project-agreements` PDF. Authenticated studio-author RPCs validate the project, stored object and attestation. An internal eligibility helper replaces only the existing design-origin prerequisite in the four current furnishings/checkpoint implementations (revision 2 includes `_publish_budget_checkpoint_00661_impl`). Billing authority and each authorization's own approval requirements remain unchanged. One project-bound sheet serves both the inline warning and existing Spotlight fix slot; a focused React Query hook handles upload, recording, eligibility and private viewing.

## Tech Stack
Existing PostgreSQL/Supabase RLS, Storage and RPCs; generated Supabase types; React/Next.js, TanStack Query, existing sheet/controls/viewer; SQL transaction assertions and designer-portal Jest. No new dependencies or services.

## Constraints
- Existing project only; no synthetic origin, signature, approval, billing authority or rates.
- Studio-author access only; private PDF <=20 MiB, server-validated metadata, nonfuture signed date, explicit coverage confirmation.
- One evidence per project; identical retry safe, conflicting record rejected; recorded object and evidence immutable even under generic permissive storage policies.
- Reject recording on projects already carrying Patina origin or billing authority. Preserve existing Patina and suspended-authority behavior.
- No automatic send or purchasing preparation; upload occurs only on explicit Record. Loading/error stays closed.
- Preserve current function bodies and every unrelated snapshot, lock, amount, pricing, image, signature, payment and idempotency check.
- Local DB only (`127.0.0.1:54322`); no reset, push or deploy. Migration number provisional until checked.

## Testable steps
1. Trace current FF&E → RegionHead → DocumentAction/Spotlight and current purchasing RPC definitions; inspect local baseline, runner and quality support.
2. Write SQL negative assertions for missing evidence, ownership/validation, immutability, retry and unchanged financial/signature authority. Run genuine assertion red before implementing.
3. Add evidence/storage policies and scoped RPCs; graft only prerequisite and necessary external draft metadata into current function bodies. Apply incrementally locally; run SQL lifecycle regression, regenerate legacy grants and package-pinned DB types.
4. Add focused hook and accessible sheet tests: explicit submission, validation, failures, invalidation and private view. Extend inline/Spotlight tests to prove the same project-bound recovery action and fail-closed state.
5. Implement hook, sheet, narrow hold propagation and FF&E integration using existing components. Document exact user labels in help.
6. Build required workspace dists; run focused checks, designer type-check and configured quality gate. Commit declared paths, run the dispatch-pinned verifier on clean candidate, submit evidence. Local synthetic PDF upload/view walk only; report unavailable gates honestly.

## Independent review focus
Tenant/project boundary; restrictive private storage read/upload and immutable identity; unchanged own signatures and billing holds; all three current prerequisite consumers; exact latest-body grafts; realistic SQL and UI failure/lifecycle coverage. Independent cross-provider review and combined integration gate belong to the parent before any production change.
