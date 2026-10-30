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

**Cohort targeting (RC-6, 2026-10-28).** Release `designer-paper-round8` only to identified persons: a person-property or user-id cohort. Never use an anonymous percentage rollout, so an anonymous evaluation is always false. The latch accepts a fresh `true` answer without re-checking identity; with identified-only targeting, an answer evaluated before sign-in cannot select round 8. A stale anonymous `false` that lands just after sign-in leaves a flagged user on legacy for that load only. Two attempts to close this in code were withdrawn: one regressed late session identity, and the other read PostHog private fields that are minified in the shipped bundle.

**Kill-switch caveat.** A tab already latched to round 8 stays on round 8 across reloads while the PostHog SDK is blocked, until the tab closes. This is the recorded tab-latch fallback.

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

### Ship chain (RC-5, re-based on the integration tip, 2026-10-28)

The full runbook, with commands, probes and rollback per stage, is `evidence/rc/rc5-rollout-rehearsal.md` §1. It was written and rehearsed on an owned, populated stack, never executed against production. These corrections apply on top of it:

1. **Migrations: 00867 plus 00868–00904, 38 files.** Strata's head is 00866. `supabase db push` cannot skip a file, so main's `00867_margin_notes_tenant_guard` ships with this push. Kody's "ship 00867?" ruling is therefore required before the round-8 push. 00896–00899 (RC-6 database fixes) postdate the RC-5 rehearsal; 00896–00905 were measured on a populated stack at the RC-8 gate (`evidence/rc/rc8-k19-locks.md`). RC-8 adds two files that ship together with the rest:
   - **00903** (K9/K11): C6 audience and the re-request refusal.
   - **00904** (K12): the retryable 40001 refusal codes.
   - **00905** (K10): the C2 launch arrangement catalog, a DRAFT. Held per K21 in `supabase/migrations/_pending/`; it ships after Kody's review of the K10 content, renumbered to the then-current head. C2 activation also waits on that review.
   Patina Field builds carrying K13 ship only after 00874 is live on Strata; the PGRST204 and subject-guard 23514 fallbacks are safety nets, not the gate.
2. **AccessExclusive locks on `auth.*`/`storage.*`:** 00868–00871, 00874–00878, 00886, 00888, 00889 and 00892 (13 files; 00892 recreates seven `storage.objects` policies). **00896–00905 take no lock on `auth.*` or `storage.*`** (measured on a populated stack, `evidence/rc/rc8-k19-locks.md`): the list stays at those 13 files. Their only AccessExclusive locks are `service_acceptance_requests` for 9.8 ms (00899, empty until C4 activation) and the view `margin_items` for 26.0 ms (00902); the longest file is 00904 at 34.8 ms with no relation lock, and all ten measured files total 105.7 ms in-transaction. The nine files in this push total about 102.4 ms; held 00905 contributed 3.3 ms and no AccessExclusive relation locks. Strata runs with `lock_timeout = 0`, so a waiting file stalls every sign-in queued behind it. Window: 00:00–04:00 CT. Set `lock_timeout` 5 s and `statement_timeout` 60 s per file. The mechanism is a ship-time decision (RC-5 §2.3: in-file `SET LOCAL`, a role setting, or per-file `psql` plus `migration repair`). None is verified.
3. **Edge functions: 44.** Every function that transitively imports `_shared/send-authority.ts` (43, re-counted at 5e2d113ea), which covers all 8 `outbound-kinds` and all 8 `outbound-send` importers, plus `service-acceptance-paper-hash`. `stripe-webhook` is in the set although its source is unchanged.
4. **Portals: designer and client**, through `infra/deploy-portal.sh`. Export the production Supabase trio from each `wrangler.jsonc` in the same shell (plus `SUPABASE_ORIGIN_RUNTIME` for designer).
5. **Activation order: C2 before or with C4, then C6.** Every C4 mutation refuses `scope_editions_inactive` until `server_capabilities.scope_editions` is on and its three grants exist. C4 activation also waits for Kody's K10 content review and release of held 00905, because C2 must activate before or with C4. Each activation is a reviewed migration that is not yet written.
6. **Activation gate: renderer coverage (RC-5 D9).** The C2/C4/C6 capability switch is global, but the designer acceptance and completion screens exist only in the round-8 renderer. Do not activate while any designer who could be asked to act still renders legacy. Either the renderer flag reaches every studio first, or the legacy frame gains the sections.
7. **Kill switch:** see §2. A tab already latched to round 8 stays there while PostHog is unreachable. Tell cohort users to close the tab, not reload.

Once the user requests production shipment, follow `patina-deploy` and the affected migration/edge/service/iOS skills. Portal deployment uses `infra/deploy-portal.sh`, which rebuilds workspace distributions. Verify actual behavior and relevant data, not static version strings. Merging the branch alone does not deploy.
