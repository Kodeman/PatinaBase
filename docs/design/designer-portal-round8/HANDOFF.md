# US-52 Room Proof 08: handoff off Sidequest (29 October 2026)

Kody retired Sidequest as this program's engineering control plane on 29 October 2026 (decision K1-R in [DECISIONS.md](DECISIONS.md)). This file holds everything that lived only on the Sidequest board, so the program can continue with ordinary subagents, worktrees and orchestrator-run merges.

## Where the program stands

- **Branch:** `redesign/designer-portal-round8`. It holds waves W0–W5 and the WP-11 repairs. The code tip under test is `7d5d872f3`; the docs-only commits after it add the RC-3b evidence and this handoff.
- **Migrations on the branch:** `00868`–`00895`. None is on Strata. Everything consequential ships inactive (C4 service acceptance and C6 completion are server-gated until activation).
- **Plan:** `~/.claude/plans/use-astra-on-max-iridescent-muffin.md` (waves, gates G1–G5, rulings).
- **Evidence:** `evidence/rc/`. RC-1 SQL gate (`rc1-sql-gate.md`), RC-2 consumer walk (`rc2-consumer-walk.md`), RC-3 browser matrix (`rc3-browser-matrix.md`) and RC-3b final-tip matrix (`rc3b-final-tip-matrix.md`).
- **Sidequest archive:** the board database, raw verification logs and review reports were backed up to `~/sidequest-backup-2026-10-29.tgz`, a copy of `~/.claude/sidequest/`. Raw gate logs cited by the evidence docs live under `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-<n>/`.

## RC-3b results on 7d5d872f3, and what they leave open

| Gate | Result |
|---|---|
| G1 | Designer build and both type-checks pass. Lint: 0 errors, 254 warnings. **The admin build fails:** `Can't resolve '@patina/api-client'` (`src/services/orders.ts`). |
| G2 | **15 of 14,159 Jest tests fail**, all in one paper/resume suite, all with `TypeError: useServiceAcceptance is not a function`. `@patina/supabase`: 2,097 pass, 12 skipped. |
| G3 | **Blocked.** `e2e/helpers/help-state.ts:19-23` accepts only port 54321, and the G3 specs write rows, so they cannot run on the read-only shared stack. |
| G4 | 200 pass, **10 fail**, 4 skipped. 8 are `scale-profile.spec.ts:125` at 36/80/500/2,000 lines ("Silent truncation: DB N, fetched 0, rendered N"). 1 is Chromium `configured-placement.spec.ts:242` (Library handoff textbox not found). 1 is a WebKit-iPhone 320 `rc4b-presentation.spec.ts:34` auth-setup timeout. Every RC-3 G4 failure now passes. |
| G5 | Passes. `/desk` is 63,636 B under budget; `/doc/[id]` is 7,907 B under. |
| RC-2 journey | Passes: both journeys, 10 of 10 legs, clean teardown. |
| A11y | Width, 200% zoom and reduced-motion probes done. **No axe scan and no screen-reader pass.** |

## Remaining work, in order

1. **RC-3 triage (new).** Root-cause each of these before fixing (systematic debugging):
   - **Admin build `@patina/api-client`.** Check whether the RC-3b worktree's offline install produced it, or whether it is real on the branch, and whether main has it too.
   - **G2 `useServiceAcceptance is not a function`.** Probably a suite whose `jest.mock` of the service-acceptance hooks module predates SQ-2349/SQ-2352.
   - **G4 scale-profile "fetched 0".** Find whether the fetch path or the test's reader changed after RC-3.
   - **The two single G4 failures.**
2. **RC-3c (was SQ-2356): unblock G3.**
   - Widen the local-only guard in `apps/designer-portal/e2e/helpers/help-state.ts` to any loopback port (`^https?://(127\.0\.0\.1|localhost):\d+(/|$)`). It must keep refusing every non-loopback host.
   - Sweep `e2e/helpers/` only for the same 54321/54322 pins. Do not touch `playwright*.config.ts` or spec assertions.
   - Prove both directions: the Strata URL still throws `REFUSING`, and `http://127.0.0.1:57321` passes.
   - Run G3 on an owned stack and write `evidence/rc/rc3c-g3-legacy.md`. Compare with RC-3's G3: 13 pass / 2 fail / 1 skip / 3 did-not-run on shared 54322.
3. **RC-5 (was SQ-2238): rollout and rollback rehearsal. Nothing gets deployed.**
   - **Write the ship chain into `ROLLOUT.md`, in order:**
     1. Strata `db push` of 00868–00895, all inactive, one transaction per file.
     2. Edge functions: `service-acceptance-paper-hash`, plus every importer of `_shared/outbound-kinds` and `send-authority`.
     3. Designer and client portals via `infra/deploy-portal.sh`.
     4. The iOS build, later.
     5. The flag cohort for `designer-paper-round8` (with `one-voice` on and `worktable` off).
     6. Separate activation migrations, C4 then C6, only after ruling evidence and consumer sign-off.

     Give every step a probe and a rollback.
   - **Include the RC-1 lock note.** These DDL migrations hold AccessExclusiveLock on `auth.*`/`storage.*` until COMMIT, through a DDL event trigger: 00868–00871, 00874–00878, 00886, 00888, 00889 and 00892 (RC-5 measured 00892; 00896–00899 are measured at the final-tip gate). Sign-in and storage stall meanwhile. Plan a low-traffic window, state the per-file stall window and give `lock_timeout` guidance.
   - **The outbound-kinds importers to redeploy:** outbound-draft-send, decision-reminders, expire-decisions, field-daily, invoice-reminders, notification-digest, review-requests and site-request-dispatch.
   - **Superseded by RC-5:** the redeploy set is 44 functions, not these 8 (every transitive `_shared/send-authority.ts` importer, which covers all `outbound-kinds` and `outbound-send` importers, plus `service-acceptance-paper-hash`). The corrected chain is in `ROLLOUT.md` §6.
   - **Rehearse locally:**
     - the renderer flag on, off, and unresolved mid-session, with no remount during an edit;
     - the recorded fallbacks in `evidence/flag-inventory.md` §4: DNT is treated like any other user (flags resolve), and a blocked or hung SDK falls to the tab latch, else legacy;
     - activation then deactivation on an owned stack, showing the paused states.
   - **Walk the WP-00.2 preserved-capability inventory** on both renderers. Mark each capability present, moved (and where) or missing; missing counts as a defect.
   - Write `evidence/rc/rc5-rollout-rehearsal.md`.
4. **RC-6 (was SQ-2239): independent frontier release review.**
   - Use the other provider (Codex Astra; Opus if Astra is unavailable).
   - **Range:** `main...redesign/designer-portal-round8`, read incrementally, migration by migration.
   - **Lenses:**
     1. authority, RLS and grants (no anon/PUBLIC EXECUTE; service_role only as planned);
     2. money (external fulfilment is never priced as studio commerce; Stripe untouched);
     3. the C4/C6 invariants (`close_project` unchanged);
     4. migration safety on a populated Strata;
     5. the legacy renderer and old consumers (X08);
     6. evidence coverage of A01–A24 and X01–X10.
   - Report every finding with severity and confidence, ending with SHIP-READY or NOT-READY.
5. **Stop.** Shipping needs a separate "ship" request from Kody.

## Open questions for Kody

1. **Ship 00892 to Strata on its own?** It guards the project-documents RLS uuid cast, and production listings are likely failing now. It needs an explicit "ship".
2. **Household-card consent.** `studio_contacts.profile_id` can be set by any active non-guest studio member, with no consent from the person. After 00894/00895, that link lets the linked account respond to service acceptance and read completion. Should linking require the person's consent before C4/C6 activation? This does not block the RC.

## Accepted debt (recorded, not fixed)

- **G5 and performance:** SQ-2192 G5-doc residual; P11 profiles beyond the measured cases.
- **Harness:**
  - SQ-2196 owned_seed cleanup R1–R5.
  - paper-order: 15 pre-existing failures.
  - SQ-2343: F3 (no SIGINT handling), F4, F6.
  - SQ-2347 F5: only 1 of 3 runner cases is covered.
- **Review residuals:** SQ-2220 F1–F3; SQ-2293 F3/F4; SQ-2296 L1–L4; SQ-2304; SQ-2305; D7; D9; SQ-2307 F3/F4; SQ-2310; SQ-2313; SQ-2315 F3/F4; SQ-2316; SQ-2319; SQ-2327 F2; SQ-2330 (HMR).
- **SQ-2340:** no live walk or screen-reader pass of the scope-sync repair.
- **SQ-2342:** other buckets' casts; tenancy gap (see the co-member RLS gap program).
- **Service acceptance:**
  - SQ-2351 R3: `studio_contacts.email` unused (LOW).
  - `request.outbound_draft_id` can be stale (informational).
  - SQ-2353: the two-session relink/respond race and the multi-card collision are UNVERIFIED.

## Board-only state you can ignore

- **Thirteen rejected candidates were never closed** because Sidequest could not close them (upstream issue #705): SQ-2300, 2301, 2309, 2311, 2312, 2314, 2318, 2328, 2329, 2332, 2336, 2337 and 2343. Their repairs are all integrated on the branch.
- **Two were delivered by hand:** SQ-2340 (merge `a0a48079c`) and SQ-2347 (fast-forward `2500b53b6`), because integrate refused on per-commit overlap (#709). Both are on the branch.
- **Upstream Sidequest defects found during this program:** `artifacts/ios27-delivery-plan-2026-09-23/execute/sidequest-upstream-defects.md` in the main checkout (#697–#707, #709).

## Working rules that still apply without Sidequest

- One worktree per agent, retired at task end. Stage explicit pathspecs; never `git add -A`.
- The shared local DB (54321/54322) is read-only for this program.
  - Write-heavy tests use an owned stack: a scratch workdir with only the five `supabase/.temp` version pins, a non-default port range, `-x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`, and teardown with `--no-backup`.
  - Never `supabase:reset`; never `--linked`.
- Cross-provider review: Codex reviews Claude-built work, and Opus reviews Codex-built work. Reviewer briefs say "report every finding with severity and confidence" and "do not invoke the code-review skill".
- **Push integrated tips with the refspec braced:** `git push origin "${T}:refs/heads/redesign/designer-portal-round8"`.
- No prod, Strata or PostHog changes without Kody's separate "ship".
