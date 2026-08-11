# Workflow Alignment — Execution Handoff

**Date:** 2026-08-11 · **Author:** design/review session (Fable) · **Executor:** a Claude Code session in this repo, following root `CLAUDE.md` (Model dispatch applies: Fable orchestrates, Opus/Sonnet/Haiku execute)
**Status of this package:** ratified by Kody 2026-08-11 — all nine rulings, rework-in-place integration, full scope (WP1–WP4).

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
