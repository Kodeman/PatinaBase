# Integration, data compatibility and eventual rollout

This preparation does not authorize deployment. Later production mutations require the user's explicit request in that session, following root AGENTS.md and the applicable deployment skills.

## 1. Establish the baseline

WP-00 records current route/identity behavior, domain migrations actually present locally, test health, role visibility, consumer versions and performance. Capture exact SHAs, data profile and inherited failures. The source baseline is not proof that every checked-in migration is on Strata. Use read-only deployment/schema inventory when the later task authorizes it; do not infer deployment from a migration filename.

Main is synchronized into the integration branch by its named lead at each working-day start and before migration/contract merges. Compatible, reviewed release slices move to main behind the agreed flag; local or review pilots can precede that, but a production cohort requires deployed compatible main code and explicit shipment authorization. See AGENT-HANDOFF for ownership and migration reconciliation.

## 2. Evolve the renderer, retain the business system

Introduce the approved composition around current providers, domain hooks and routes. If rollout needs a variant, mint a new narrowly scoped feature flag with the existing mechanism; `designer-paper-round8` is a candidate name pending WP-00. Do not revive `the-document-pilot` or `/portal` zones.

The existing Document renderer is the fallback. Both renderers read the same canonical data and command owners. No dual-writing, copy-back from local storage, duplicated approvals or divergent state machines. Verify flag/loading failure behavior without exposing half-rendered controls. Avoid mounting both large renderers invisibly. Load the chosen renderer through separate dynamic chunks, then measure the real route/common-chunk budgets; code splitting alone is not proof the duplicate weight disappeared. Any budget exception needs an explicit measured decision, not a silent increase.

The current `useFeatureFlag` is client-side and false/loading until resolved. It settles false when analytics is unavailable due to missing configuration/development opt-in, but has no general network timeout. PostHog is initialized with `respect_dnt: true`; the inspected application code does not establish a deterministic consent/DNT terminal result. WP-00 must test DNT, blocked SDK/network and any actual consent policy, and choose an accessible deterministic fallback/reserved layout for unresolved cohorts. Do not hold the whole paper indefinitely behind an analytics read.

`NEXT_PUBLIC_FLAG_OVERRIDES` is build-time (only literal `true` enables a named flag); a production override change in wrangler vars requires rebuild/redeploy. Record how remote/cohort evaluation propagates, refresh/reload requirements and measured kill-switch latency before pilot approval. Do not describe flag-off as instantaneous. Preserve the settled-paper layout contract and prevent renderer swaps from losing drafts or shifting the reader’s place.

## 3. Additive domain evolution

For each C-contract change, document old/new RPC request and response, auth/RLS, consumer compatibility, idempotency, audit, migration/backfill and rollback behavior. Use expand → migrate → adopt; keep old clients/readers safe through the agreed compatibility window. New optional fields must not make older records falsely accepted, funded or authorized.

Backfills must be explicit and reviewable. Never infer a historical client acceptance, signature, fabrication instruction, verified measurement or authority grant from a status label. Unknown remains unknown. Scope proposals and existing signed records retain their original provenance. External purchases cannot be converted into studio liabilities as a migration shortcut.

**Server activation is separate from the renderer flag.** P10/P12 must name the domain/deployment owner and activation/grant timing for new acceptance, external-fulfillment and fabrication-authority mutations. A client PostHog value cannot authorize or disable an RPC. Before merging a release slice to main, choose a deny-by-default server capability/enable control using existing authority patterns, or keep new callable grants withheld until a reviewed activation migration. Record how consequential writes are disabled again while preserving reads/history. Do not build an unrelated flag service.

Every migration merged to main must be safe to apply independently of the unfinished UI or a later unrelated deployment. Coordinate pending migration/grant inventory with whoever deploys main. Direct RPC tests must prove that disabled/unreleased actors cannot call the new transitions even when a caller bypasses the UI or uses an old client. The later shipment request and P06/P07 policy still control activation; renderer rollback alone is insufficient.

Recheck migration numbering at integration. Local replay and domain SQL tests precede shipping. Shared edge-function changes require redeploying all importers when deployment is authorized. Supabase-first ownership and the existing three retained services remain in force.

## 4. Pilot evidence

Use agreed internal/studio pilot cohorts and representative jobs after the local acceptance suite. Test actual scale, varied job types, real supported devices, saved links, privacy and recovery. No real outbound action is automated for a design demo. Capture process failures and time-to-complete/recovery as usability evidence; do not optimize the studio for engagement metrics.

The founding-team review should walk one integrated full-service/build-team commission and one design-only/client-buy case, including exceptions and final service acceptance. A studio/home screenshot alone cannot approve the rollout.

## 5. Rollback / stop conditions

A visual flag can restore the old renderer only if it can safely read records created by the new experience. New acceptance/package/authority state requires a compatibility plan; “flag off” is not a database rollback. Stop rollout on unauthorized data exposure, false effective acceptance/authority, duplicate commercial action, lost edits, material accounting divergence or unusable core mobile/keyboard flows. Preserve evidence and drafts; fix forward for data defects under the repository's migration practice.

Define the incident owner, cohort switch, observable health signals and recovery test before the first production cohort. Do not destructively undo migrations or erase history to restore a screenshot.

## 6. Release candidate and deployment

WP-11 supplies the acceptance evidence matrix, source-preservation result, all independent review dispositions, new-contract consumer tests, additive migration/backfill rehearsal, rollback proof and founder visual review. Scope any deferral explicitly; security or business-integrity defects do not become acceptable because the screen resembles round eight.

Once the user requests production shipment, follow `patina-deploy` and the affected migration/edge/service/iOS skills. Portal deployment uses `infra/deploy-portal.sh`, which rebuilds workspace distributions. Verify actual behavior and relevant data, not static version strings. Merging the branch alone does not deploy.
