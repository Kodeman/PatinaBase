# Workflow Alignment — Execution Handoff

**Date:** 2026-08-11 · **Author:** design/review session (Fable) · **Executor:** a Claude Code session in this repo, following root `CLAUDE.md` (Model dispatch applies: Fable orchestrates, Opus/Sonnet/Haiku execute)
**Status of this package:** ratified by Kody 2026-08-11 — all nine rulings, rework-in-place integration, full scope (WP1–WP4).

---

## 0. Execution status — updated 2026-08-12 — PROGRAM COMPLETE — WP0–WP4 merged to main. READ THIS FIRST.

> **Erratum (2026-08-12):** the wave1 migrations were renumbered **`00434`–`00445` →
> `00461`–`00472`** to clear the FF&E ledger block that had been applied to Strata
> out-of-band at `00433`–`00445` (those thirteen FF&E files are now materialized on
> `main` with provenance headers). Every migration number in §0 and §§1–9 below
> predates that renumber — in particular, the `00444` deploy gate discussed here is
> now **`00471`**, and it remains HELD. The current mapping, apply sequence, and
> operator procedure live in **`docs/ops/wave1-prod-reconciliation-plan.md`**; the
> renumbered contract tests are inventoried there in §8.1.

WP0–WP4 are executed. A fresh session picks up at "Next actions" below; §§1–9 remain the program's historical record.

**Main is reconciled and carries everything through G9** — tip `5ef7df57`, pushed:
`f2d25818..f88fafe0` (rebased docs trio) → `09921df7` mirror-lineage restore (Kody ruled LOCAL wins all 9 divergent files; `.claude/skills` restored as the canonical real tracked directory, origin's symlink-into-`.agents` model reverted; `.agents` stays tracked content-matched — untracking is an open question) → `a45329f9` waitlist migration keeps **00433** (ruled) → `0508c967` **WP1 merge** (all six guide defects fixed; two adversarial review rounds; DECISIONS I110–I112; suites pinned; 315-suite gate was fully green at merge) → `f03f7058` dev-account role-mapping merge → `4361ad4e` CSP connect-src merge → `16861674` retune CLAUDE.md restored (ruled over origin's Herdr version) → `a20ebf4f` **G9 Field close-gating merge** → `5ef7df57` dev-env-contract test relocated to the parked turbo branch.

**Wave1 branch `feat/workflow-wave1-integration`** — tip `c29a0921`, pushed; worktree `.codex/worktrees/workflow-wave1`:
rebased onto main; migrations renumbered **00434–00445** (strict +1 verified; waitlist keeps 00433); `seed/00-legacy-grants.sql` regenerated via `python3 scripts/generate-legacy-grants.py`; tip stowaways split out earlier (`5eb02fef` → three branches; role-mapping + CSP merged to main, **`chore/turbo-dev-passthrough-env` PARKED** at `d8acee5c` carrying its dev-env-contract test — they merge together if unparked); full-stack restatement audit found **zero silent reversions** across all 17 main-installed function bodies restated by the stack (00436×11 + 00437/00438/00442/00443 hops, all composite-checked); audit corrections applied + adversarially reviewed (40001/40P01 re-raise, court assert, comment truth-fixes); `useProjectApprovalRealtime` shim retired (3 callers); handoff-band labels now derive from `residential-workflow.ts`; `approval_records` confirmed frozen (zero live callers outside services/projects); dissolve-grammar contract updated per Kody's ruling — "Request sign-off" left the work block, Stage-2 gates own sign-off authoring (DECISIONS **I113**).

**WP3 executed.** Three parallel tracks, each independently adversarially reviewed then remediated, merged into `feat/workflow-wave1-integration`; final tip **`3b299cf2`**, pushed. Merge order: `0b7e7d3a` R1+R2 (stage-document render path deleted, section sub-label + Strata-Mark track fills, six-part gate ceremony restaged from `project-approval-document.tsx`; SCOPE renders from the server-validated one-phase binding — NO migration minted, the dedicated SCOPE field deferred to the next wave that restates the approval RPCs) → `4dc64773` R3–R6 (handoff band dissolved into margin items fed by the untouched 00442/00443 projection; overdue = one derivation → stamp + guide sentence; R6 delivered deliberately short: folio need lines are NOT gate-keyed — doing it honestly needs a Desk-scoped projection, Kody's call) → `55ff3caf` R8 (client ceremony with verbatim outcomes copy, overdue devices removed from all current-generation client surfaces, HELD FOR DISCUSSION stamp gold-border/charcoal-text) → `3b299cf2` stage-line relocation into the active section head per M1-after. DECISIONS I114–I120 appended (renumbered from the three branches). R9 verified: nothing in the repo renders the co-approver. Mood-board suite fixed at `4a69109c` (wave1's own 6d75de2e needed a `@patina/supabase` mock; real regression, not flake).

**Gates at WP3 close**: designer-portal type-check clean + **3361/3361 tests green**; client-portal type-check + build green, tests green except the 2 known pre-existing failures; `git merge-base --is-ancestor` proofs pass for all three track tips (`72b19664`, `383a3568`, `7a755266`); `git diff 4a69109c..3b299cf2 -- supabase/` is empty (only `packages/types/src/residential-workflow.ts` copy neutralization outside the portals).

**WP3 gate items still open**: e2e (gate ceremony + margin handoffs + the relocated `workflow-stage-responsive.spec.ts`) and the ≥1280/~390px screenshots — both need a running local stack, i.e. the same `.env.local` fix as the replay proof.

**Gates at pause**: designer-portal type-check ✅; client-portal type-check + build ✅; @patina/supabase 759 tests ✅; 13/13 SQL workflow suites ✅ (run against the schema-equivalent pre-renumber DB) + Deno storage suite ✅ (same run); designer-portal tests 3245/3246 — one failure in `board-image-inspector-actions.test.tsx` (mood-board cutout; unrelated to this program; appeared only in the final run — triage, possibly flaky).

**⛔ The one outstanding WP2 gate item — needs Kody first**: the formal clean-replay proof (`pnpm supabase:reset` replaying 00001–00445 + re-run of all 13 SQL suites + Deno storage suite from the wave1 worktree). Blocked because `.codex/worktrees/workflow-wave1/apps/designer-portal/.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at Strata prod and the reset guard (correctly) refuses; `.env*` files are hard policy-denied to agents (read AND write, even sandbox-disabled). **Kody: edit that file** (and optionally the main checkout's copy) to the local stack — `http://127.0.0.1:54321`, anon/service keys from `supabase status`, prod lines kept commented — then any session can run the reset + suites.

**Deploy rules (nothing has deployed; prod untouched)**: the renumbered site-request privacy migration (**00444**, `site_request_close` completed-only) must NOT deploy to Strata until a Patina Field release containing `cbe88574` (close gated to completed; merged at `a20ebf4f`) ships. All other §6 constraints stand; prod deploys still require Kody's explicit in-session ask.

**Program closeout (WP0–WP3 COMPLETE)**: wave1 merged to main at `f79d9436` (`--no-ff`, message `merge(workflow): land wave1 — Stage-2 approvals, WP3 rulings R1–R6/R8, migrations 00434–00445`), with the no-drift proof (`git diff e8d53de1 HEAD --name-only` limited to the main-side-only paths: `CLAUDE.md`, `docs/design/workflow-alignment/HANDOFF.md`, the SMS files, and the identically-deleted `dev-env-contract.test.ts`) confirming nothing outside that set entered the merge. e2e + screenshots pass (`6faa03de`) and the overdue-item rail-collapse fix (`e8d53de1`, need-line ≥90px e2e-asserted) landed before merge. The replay proof ran green 2026-08-11 (00001–00445 + 13 SQL suites + Deno) after the `.env.local` fix (note: the wave1 worktree's `.env.local` is a symlink to the main checkout's file). Separately, main gained two concurrent SMS commits (`ef9f9f28`, `ac3f8db4`) mid-program from another lane — `ac3f8db4` adds migration **00458** and leaves a reserved-looking gap at 00446–00457; the replay proof above predates 00458, so it was never exercised by that reset — the next full local reset will cover it.

**WP4 executed 2026-08-12** per Kody's design-checkpoint rulings: the unified two-rail contract (Rail B/Rail A), a pure rendering grammar (zero migrations — the 15-step lifecycle derives entirely from existing operational fields, including derived sub-seals), and an all-portals actor-neutral copy sweep. Three tracks (`feat/wp4-procurement-lifecycle`, `feat/wp4-ordered-retirement`, `feat/wp4-rail-a-adoption`), each independently adversarially reviewed then remediated. Merged to main at `5069c5e8adca18981883e502b99159023839240e` (`--no-ff`, `chore(wp4): land R7 procurement lifecycle — 15-step grammar, two-rail contract, Ordered retirement`); no-drift proof (`git diff 0d5cd291 HEAD --name-only`, empty — main had not moved since the WP4 branch point, so the merge tree is identical to the branch tip). Zero migrations. DECISIONS **I121–I125** appended. №8 docket (the five dark/unbuilt steps, carrier/tracking, and returns) lives in `docs/design/workflow-alignment/wp4-lifecycle-mapping.md`. Gates: designer-portal 3487/3487 tests green; all three touched portals (designer, admin, client) type-check clean; 13 screenshots under `docs/design/workflow-alignment/screenshots/wp4/`.

**Next actions**: (1) deploys only on Kody's explicit ask — **00444 still gated on the Field release carrying `cbe88574`** before it can go to Strata; (2) №7 remains open (copy stays actor-neutral for now; the step-01 date and deposit qualifier return if commercial-policy guard №7 settles); (3) №8 data wave (the dark steps, carrier/tracking, returns) when Kody prioritizes it; (4) follow-ups: BOH admin API needs per-line SELECTs to produce a dated procurement trail, `boh-queue.spec.ts` has a stale sign-in selector, local-DB WP4 fixtures are outstanding, and the queue glance is intentionally absent on the exception/unmapped band (by design, not a gap).

**Production deploy 2026-08-12 (Kody-authorized, full chain)**: ① migration ledger reconciled — phantom 00446–00457 (out-of-band FF&E lane) materialized into git at `06763227`; 00458 pushed to Strata + object-probed (sms_messages.error_code/error_message live); git↔Strata zero drift through 00458. ② 10 edge functions redeployed (sms-dispatch/-inbound, field-daily, site-request-dispatch, decision-reminders/-resolved-notify, expire-decisions, notification-digest, board-asset-cleanup, spec-pdf; sms-status already fresh) + `media-svc-worker` container (background-removal fix, health-probed). ③ Portals deployed via deploy-portal.sh with prod env exported (never .env.local): designer `6e28a670` (12:44Z), client `c3c412ef` (13:11Z), admin `acd10b7e` (13:19Z) — all verified by deployments-list + live asset-hash match; manufacturer unchanged/skipped.

Flags recorded: ⚠ three functions ACTIVE on Strata with no source on main (`project-ffe-document-extract`, `project-review-media`, `selection-review-send`, deployed 08-10 from an unmerged FF&E lane — land that branch); `site-request-guest` still deliberately undeployed (pending iOS); ⚠ `PATINA_ALLOW_LOCAL_PROD_DEPLOY=1` override sits in `.claude/settings.json` env — Kody to revert now that the deploy is done; owed: Kody's signed-in walks across the newly-live WP1–WP4 surfaces (Stage-2 ceremonies, margin handoffs, client ceremony, procurement trail + orders book, BOH glance).

**Still owed Kody (rolling)**: Direction↔stage-05 seam (§8.3) · R9 co-approver + №7/№8 (§8.4) · WP4 checkpoint · unpark-or-drop verdict on `chore/turbo-dev-passthrough-env` · whether to untrack `.agents` (both it and `.claude/skills` are now tracked, content-matched — drift risk) · signed-in walks across all WP1 surfaces · follow-up tickets: `dateValid` guard uncovered on 3 sheets, 2 pre-existing ESLint errors in `use-commercial-documents.test.ts`, pre-existing client-portal `portal-access`/`orders` test failures · mood-board `board-image-inspector-actions.tsx` catch block silently swallows non-`BackgroundRemovalClientError` failures (turned the 6d75de2e regression into a silent no-op) — surface/log decision · legacy `ClientDecision` surfaces (`client-portal app/decisions/page.tsx` "Overdue (N)", `decision-card-client.tsx`) still show overdue to clients — older decision system, outside R8's ratified scope; does the no-overdue-devices principle reach it? · below 1180px the margin rail is `display:none` and mobile handoff chips are summary-only — the guide's gate act is unreachable there; closing it = building mobile handoff acts (new work) · guide precedence: an open gate outranks every urgent operational need (damage claim, schedule conflict) per R5's "nothing else decides" — bless or add an urgency floor · 00442 projection marks `review_required` (draft + incomplete confirmations) as recipient='client' though the work is studio-side — a client-side lane override shipped; the projection fix is a migration decision · deck erratum: folio 09 cites "the 00441 and 00442 projection"; correct is 00442/00443 (00441 is stage2_option_frozen_authority) · `.claude/skills/` is deleted in main's working tree with skills relocated to `.agents/skills/` + untracked `skills-lock.json` (skills-CLI migration, uncommitted) — commit or revert; ties into the existing untrack-`.agents` question.

**Executor mechanics learned this session**: sandbox blocks git-SSH network, docker.sock, and `.claude/worktrees` ops — retry those with `dangerouslyDisableSandbox` on that evidence; `.env*` is hard-denied to agents regardless; a first `pnpm install` in a fresh worktree can false-report success; long-context subagents stall between steps — resume them or respawn fresh with a state-verification phase; the local Supabase stack was left running; Kody's unstaged `playwright.config.ts` edit and `stash@{0}` remain untouched and must stay so.

**Wave1 reconciliation E2 apply EXECUTED on Strata 2026-08-12**: the renumbered migrations were staged onto prod via `supabase migration up --linked` (00460–00470 + 00472 applied; ledger rows complete) with **00471 intentionally HELD** — the ledger gap is recorded via `COMMENT ON SCHEMA public`, gated on a Field release carrying `cbe88574` per runbook §7 (see above, still `site_request_close` completed-only). 00461 required an in-place erratum adding trigger-disable windows around its backfills, because the prod CLI applies its migrations through a login role + `SET ROLE`, so the `session_user`-based owner-maintenance bypasses the original body relied on do not hold in that context. §5.3 privacy-posture probes ran all green post-apply, and the local gate-ceremony e2e suite is 4/4. Portal hooks that were silenced (`meta: { errorSurface: 'silent' }`, `TODO(wave1-reconciliation)`) while the wave1 schema was absent from prod are desilenced on `chore/wave1-renumber-reconciliation`; the 00471-gated `useSiteRequestActionDetail` silence (`TODO(wave1-00471-held)`) stays in place until 00471 ships.

---

## 1. Mission

Execute the workflow alignment program: fix the six guide defects on `main`, land the unmerged `feat/workflow-wave1-integration` stack (migrations 00433–00444, Stage-2 approvals, contextual handoffs) **reworked in place** per the nine design rulings, and build the R7 procurement lifecycle rendering. The design authority for every UI decision is the board deck; the merge-risk authority is the engineering memo. Do not re-derive either — read them.

## 2. Required reading (in order)

1. `docs/design/workflow-alignment/the-workflow-alignment-proposal.html` — the deck. Folios 07–13 are the rulings R1–R9 with mockups M1–M8; folio 15 is the order of work. **The mockups are the UI spec.**
2. `docs/design/workflow-alignment/wave1-engineering-review.md` — the memo. §1 what to review, §2 merge risks, §3 the six main-branch defects with file:line, §5 merge sequence.
3. `.codex/worktrees/workflow-wave1/docs/design/workflow-completion/` — Codex's own spec set (CONTEXT.md ubiquitous language, CAPABILITY-LEDGER.md invariants + build order, APPROVAL-AUTHORITY-CONTRACT.md, PRIVACY-AUTHORITY-AUDIT.md) + the 4 ADRs in `docs/adr/` on that branch. These remain binding at the data layer.
4. Canon: `apps/designer-portal/CLAUDE.md` (D1/D2/D4, source-of-truth hierarchy), `docs/design/the-document/DECISIONS.md` (append entries for every design-visible change — this program owes entries; the guide work already merged without any).
5. Skills: load `patina-db-migrations`, `patina-portal-features`, `patina-verification`, `patina-testing`, `patina-parallel-work` before the matching work. The wave1 worktree has scoped skill variants (`.codex/worktrees/workflow-wave1:patina-*`) — use those when editing files under that worktree.

## 3. Ratified rulings (summary — deck folios are authoritative)

| # | Ruling | Effect |
|---|--------|--------|
| R1 | One paper, one spine | `workflow-stage-document.tsx` + its mount **never render**. Keep 00433, `get_project_workflow`, `workflow-stage-derivation.ts`. Stages surface as section sub-labels + Strata-Mark track fills (equal-width, colour-differentiated) + quiet provenance microcopy. |
| R2 | Gate = boundary ceremony | Six-part anatomy (ARTIFACT / QUESTION / SCOPE / IMPACT / AUTHORITY / CONFIRMATION) at the section boundary; approval collapses to seal + APPROVED stamp; superseded editions linked under the seal. Restage `project-approval-document.tsx` (1,071 lines) into this. SCOPE has no schema field — add one (additive migration) or render from structured context; do not fake it. |
| R3 | Handoffs are margin items | Dissolve `contextual-handoff-band.tsx`. Each handoff = margin item: lane attribution ("With Marta"), one need line, one act (nudge/approve/redo/close map 1:1). Stage label = microtext on the unfolded item. Keep the 00441/00442 projection + `use-project-contextual-handoffs.ts` whole. No checksums, no "Exact phase/Source domain", no escalation booleans in designer-facing copy. |
| R4 | Overdue is a condition | One fact, three renderings: terracotta stamp on the margin item, changed guide sentence, Desk folio re-sorts upward. Never a badge, banner, red count, push, modal, or auto-action. |
| R5 | Guide surfaces gates | After WP1 fixes: the guide's act derives from the current gate keyed by `canonical_stage_key` ("Publish the Direction approval", "Nudge Marta — 6 days"). |
| R6 | Desk need lines key to gates | Folio need line = nearest open gate, gate's terms, one act. Studio Pulse gains ONE aggregate prose sentence. 2–4 folio ceiling untouched. |
| R7 | Procurement lifecycle | Retire "Ordered". 15-step stamp trail in line-unfold (deck M7 is the spec), three gate sub-seals (complete-to-produce / received-and-dispositioned / warehouse+site-ready) using R2's anatomy at line scale; orders book = same grammar at ledger density. **Actor-neutral step names** (see §7). |
| R8 | Client ceremony | Keep the three outcomes + copy VERBATIM (`project-approval-review.tsx:14–34`). Add the ceremony: full anatomy, "You are approving edition 3, exactly as shown.", Scored-Ink press, visible seal settle, HELD FOR DISCUSSION stamp on needs_discussion. **Remove the shipped client-side terracotta "Overdue" indicator** (`project-approval-review.tsx:168–173`) — ratified; overdue is the studio's condition. |
| R9 | Co-approver stays dark | Schema ships; no UI renders it until a governance ruling. Proposed default (do not build): named witness on the seal, never a second gate. |

## 4. Work packages, in order

### WP0 — Repo reconciliation (blocker; do first)

`main` carries local commit `ddbfdbfd` (this program's deck + memo, exactly 2 files) but cannot rebase/push: **origin/main now tracks** `.agents/skills/*` (17 files), `AGENTS.md`, `.codex/hooks.json`, and files under `.claude/skills/` that exist locally as **untracked** copies (project memory: hand-regenerated mirrors).

Procedure:
1. For each conflicting path: `git diff --no-index <local> <origin-blob>` (fetch origin first). 
2. If ALL identical → remove the local untracked copies (content is preserved in origin's tracked versions), then `git rebase --autostash origin/main`. Expect the 9 patch-equivalent duplicates to drop; `git log --oneline origin/main..main` should show only the 9b4eeba7 docs cherry-pick equivalent + `ddbfdbfd` (+ any commits this program adds). Push.
3. If ANY differ → **stop and show Kody the diff**. Do not delete divergent local files. Note: `.claude/skills` is write-protected in some session sandboxes — the removal may need Kody to run it via `! <command>`.
4. Pre-existing local state to respect: the unstaged `apps/designer-portal/playwright.config.ts` edit (+17 lines) is Kody's — never commit or discard it. A leftover `stash@{0}: autostash` exists — do not pop or drop; it is not yours. Untracked `supabase/migrations/00433_waitlist_sms_consent.sql` predates this program — **it collides with wave1's 00433 numbering; surface it to Kody in WP2 renumbering** (memo §2 + `patina-db-migrations`).

Gate: `git push origin main` succeeds; `git log origin/main -3` shows `ddbfdbfd` content upstream.

### WP1 — Six guide defect fixes (on `main`, standalone commits, before any wave1 work)

All in `apps/designer-portal`; memo §3 has file:line for each (measured at `e7fd3244`; re-locate after WP0's rebase):
1. `withInputs()` must never override a branch's action (`src/lib/document/document-guide.ts:131–155`) — the input-derived action belongs to the `needs_input` branch only; paused keeps "Review project status", needs-attention keeps its own act.
2. Document guidance must not gate on the full Desk fetch (`app/(document)/doc/[id]/page.tsx` `enabled: Boolean(row && !isError)` + 60s refetch) — scope the enrichment to stages that use it, or fetch this document's folder only; a cold `/doc/[id]` must render guidance from document-local data.
3. A Desk-query error blanks only Desk-dependent guidance, never the strip (`page.tsx` guideUnavailable fold).
4. Collapse the dead null/undefined contract (`use-desk-engagements.ts:57–63` + `?? undefined` caller) — one sentinel; a genuine Desk "no need" must not be silently replaced by local re-derivation.
5. `retry-guidance` gets a real destination variant in the `DocumentGuideDestination` union — no string-literal interception with a fake anchor.
6. The activate guard must work for controls without `aria-expanded` (`margin-item.tsx` has none) — either add `aria-expanded` to `MarginItem`'s button or make activation idempotent; `pulse_due` must never toggle an open item closed.

Gate: `pnpm --filter designer-portal test` green including new/updated tests for each defect (the existing suites: `document-guide.test.ts`, `document-guide-inputs.test.ts`, `page.test.tsx`, `document-guide.test.tsx`); `pnpm --filter designer-portal type-check`. Append a DECISIONS.md entry covering the guide work (the missing one) + these fixes.

### WP2 — Wave1 merge program (rework in place)

On branch `feat/workflow-wave1-integration` (work in `.codex/worktrees/workflow-wave1` or a fresh `agent-*` worktree of that branch):
1. **Split `5eb02fef`**: the dev-accounts role-mapping change, the CSP `connect-src` widening, and the `turbo.json` `passThroughEnv` addition each leave the workflow branch (separate branches/commits for Kody to judge independently).
2. **Rebase onto origin/main** (post-WP0, so WP1's fixes are in the base). 8 designer-portal files overlap with the guidance commits — resolve toward WP1's fixed versions; wave1's margin-rail/stage2-exclusion changes layer on top.
3. **Renumber migrations**: 00433 collides with the untracked waitlist file (WP0.4) and the tip may have moved — re-check `supabase/migrations` tip and renumber 00433–00444 as needed per `patina-db-migrations`.
4. **Regenerate** `supabase/seed/00-legacy-grants.sql` at merge time (never hand-merge the +1,098 lines).
5. **Run the verification the stack never had**: full `pnpm supabase:reset`, then all 12 SQL contract suites (11 .sql + 1 Deno storage test — invocation documented in `supabase/tests/workflow/approval_authority/README.md`), plus `pnpm --filter designer-portal test type-check`, client-portal build. All output pasted, not paraphrased.
6. Confirm nothing else reads `services/projects` `ApprovalRecord` (`schema.prisma:317`) before the client-portal `submitApproval` deletion merges; retire the `@deprecated` `useProjectApprovalRealtime` shim; reconcile the two stage-label vocabularies (memo §2.9) to `residential-workflow.ts`'s titles.
7. **00436 line-level review** (highest-risk file): diff each of the 20 restated function bodies against its current installed definition; 11 are on main — a missed line silently reverts a fix.

Gate: memo §5 merge sequence followed; all suites green from a clean reset; `git merge-base --is-ancestor` proof when claiming merged.

### WP3 — Re-housed UI (on the wave1 branch, before merge)

Implement R1–R6 + R8 per the deck mockups:
- **R1**: delete the render path (`workflow-stage-document.tsx`, `workflow-stage-document-mount.tsx`, the `page.tsx` mount) — keep `workflow-stage-derivation.ts` + hooks; build the section sub-label + track-fill surface (M1-after).
- **R2**: gate ceremony at the section boundary (M2); restage `project-approval-document.tsx`'s authoring flow into the anatomy; SCOPE field decision (additive).
- **R3**: handoff margin items (M3-after) fed by the existing projection; delete the band.
- **R4**: overdue condition grammar (M4) — stamp + sentence + Desk re-sort from one derivation.
- **R5/R6**: gate-derived guide acts + gate-keyed Desk need lines + the one Pulse sentence (M5/M6).
- **R8**: client ceremony (M8) incl. removing the client Overdue indicator; outcomes copy untouched.
- **R9**: verify nothing renders the co-approver.

Gate: designer-portal + client-portal tests/type-check green; e2e for the ceremony + margin handoffs; a DECISIONS.md entry per ruling; screenshots ≥1280 and ~390px per the workstream charter; zero `shadow` in new CSS; metadata type ≥12px floor (mockups' miniature sizes do NOT ship).

### WP4 — R7 procurement lifecycle (after WP2/WP3 merge; largest new build)

Deck M7 is the spec. Includes real read-model work: the 15 states do not all exist — design an additive item-lifecycle read model over existing `purchase_orders` / receiving / claims / `fulfillment_*` rails (see wave1 `CAPABILITY-LEDGER.md` stage-08 "Consolidate" disposition — deepen existing rails, never a parallel system). Surfaces: line-unfold stamp trail + three gate sub-seals, orders-book ledger view. This WP likely warrants its own short design-session checkpoint with Kody before the migration lands.

Gate: additive migrations only; states derive (no stored duplicates); actor-neutral lexicon (§7); suites + portal gates green.

## 5. Sequencing + parallelism

WP0 → WP1 → WP2 → WP3 → merge → WP4. WP3 can start on the branch while WP2's verification runs, but nothing merges until both gates pass. Concurrent agents: one worktree each (`patina-parallel-work`), pathspec commits, one owner for `supabase db reset`.

## 6. Hard constraints (violations are defects)

- **D1** no tabs/split views/global nav inside a document; **D2** the margin IS the notification model — no bands, nothing breaks through; **D4** zero shadows anywhere.
- Documents are a presentation layer — no `documents` table; everything derives.
- Additive migrations only; hand-numbered; never `supabase migration new`.
- Auth = Supabase Auth only. Types from `@patina/types`. Data via `@patina/supabase` hooks.
- No CI exists: local verification is the only verification — paste outputs.
- **Prod deploys require Kody's explicit ask in that session.** This package authorizes local + merge work only.

## 7. Commercial-policy guard (decisions №7/№8 — OPEN)

No UI copy may settle who buys, holds funds, or owns goods. Actor-neutral lexicon (from the deck, folio 12/14): "Cleared to produce" not "Authorized"; "Released to maker" not "PO issued" (in client/designer-facing status copy; internal PO entities keep their names). The live wave copy "engagement authorized" (stage 03) and "budget, and execution authority approved" (stage 07 gate) is in №7 territory — neutralize during WP3 ("engagement confirmed", "budget snapshot approved"). When in doubt: describe the evidence state, never the commercial actor. №8: no product-object schema beyond what the read models require.

## 8. Open items owed to Kody (surface, don't decide)

1. WP0 mirror-file divergence, if any diff is non-identical.
2. The `00433_waitlist_sms_consent.sql` collision (whose number moves).
3. The Direction section ↔ stage-05 concept seam mapping (deck folio 07 flags it).
4. Co-approver governance ruling (R9), decisions №7/№8 themselves, and the WP4 design checkpoint.
5. The split-out `5eb02fef` pieces (role mapping, CSP, turbo env) — merge or drop, his call.

## 9. Definition of done

WP0–WP3 merged to origin/main with pasted verification; WP4 merged after its checkpoint; DECISIONS.md entries appended for every design-visible change; worktrees retired (`scripts/repo-gc.sh`); feature branches pushed; a report to Kody listing each gate command + output, each open item's status, and screenshots of every new surface.
