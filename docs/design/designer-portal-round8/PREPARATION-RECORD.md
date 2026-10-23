# Branch preparation record — 23 October 2026

## Scope and provenance

The user approved Room Proof 08 and requested an integration branch prepared for later agent development. This package supplies the frozen interactive reference, linked history, current-source map, contracts, scoped decisions, work packages/team briefs, acceptance catalog and verification/rollout plan. No implementation tasks were enqueued, and no application behavior, schema or deployment was changed.

- Integration branch: `redesign/designer-portal-round8`.
- Application/source baseline: `ee9c450a582bc677a635a7e451425db4e1e51b4a`.
- Original approved mockup: `e8f92b772b702303e560583bd57ab785a1974b73`; copied unchanged by `4b911a3a6972d538ffb03817f2538a35f005e168`.
- Supporting history: `9023f6dec`, copied verbatim from the earlier local review bundle so linked prior rounds remain readable in a fresh checkout.
- Owned preparation worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-designer-redesign-plan`. The user’s shared checkout and unrelated changes were left alone. The worktree is retired after the branch is pushed; the unmerged integration branch remains.
- Program instruction pointers: root `AGENTS.md`, root `REDESIGN.md`, app `CLAUDE.md` and an appended Document decision. Historical rulings remain intact; no style/feature gate is disabled.

## Independent review and source reconciliation

Three read-only planning contexts inspected architecture, operational contracts and design/test seams. A separate actual Claude Code Opus process reviewed the primer using read-only tools; its original report is preserved unchanged in [claude-code-plan-review.md](review/claude-code-plan-review.md). These are agent reviews, not practitioner interviews or production verification.

Every initial finding is dispositioned below. “Resolved in plan” means the documentation now assigns the behavior/owner/dependency; it does not mean the future production feature is implemented.

| Review finding | Disposition and evidence |
|---|---|
| 1 — client-side acceptance owner | Resolved in plan: WP-10C and brief 07 own client portal/iOS, V22 request handoff, offline evidence and old-reader tests; WP-10 depends on it |
| 2 — unknown approval kind breaks list | Resolved: C4 defaults to a separate acceptance record/RPC/projection; any extension needs versioned old-reader safety. X08 and client brief cover mixed records. Strict parser claim narrowed to shared web; native string decoding is not the same failure |
| 3 — duplicate external-buying ownership | Resolved: one build-domain C5 owner, commerce consumer, existing purchase inventory first; WP-06 depends on C2/C5/WP-03 |
| 4 — GC cabinetry financial/closeout effects | Resolved: P05/C5 require an explicit FF&E representation/financial-participation decision and A17 checks all affected totals/readiness/closure readers. A label or nonbillable purchase is not an exemption |
| 5 — design-build capability/flags | Resolved with source correction: composer requires agreement-library + design-build; its former agreement-parts outer gate is gone. Account licensing still needs all three. CODEBASE-MAP/WP-00 inventory controlling surfaces and environments |
| 6 — integration branch to main | Resolved: named integration lead, daily and pre-contract/migration main sync, compatible release slices to main behind the agreed flag, migration-number reconciliation and manual CI evidence. Deployment remains a separate request |
| 7 — auto-loaded instruction conflicts | Resolved now as preparation docs: dated app CLAUDE pointer and appended Document entry name Round 8; all briefs state precedence. P01/P02/P03 retain scoped gate decisions. R203’s already-allowed Next plate is acknowledged |
| 8 — flag resolution/bundle/switch behavior | Resolved with source correction: ROLLOUT records client loading/fallback, code splitting, budgets and measured kill-switch latency. DNT is an SDK setting; no application consent gate/deterministic DNT result was established. Overrides require rebuild/redeploy |
| 9 — missing preparation record | Resolved by this record and the evidence files/commands below |
| 10 — service versus terminal project state | Resolved: C6 prohibits service acceptance from writing project status/closure evidence; close_project remains the separate guarded transition |
| 11 — unrecorded virtualization decision | Resolved: P11 chooses scale strategy after profiling; no preselected virtualization architecture. Browser find/export/accessibility/focus and paper geometry are acceptance requirements |
| 12 — providers/mobile/error ownership | Resolved: provider/bare-board/session isolation, 1180/1440 seams, DeskDoorway mount order, dynamic heights, mobile jump callbacks and inline failure/query suppression added. Global Toaster presence is described accurately |
| 13 — missing invalidation seams | Resolved: approval invalidation, settleScheduleWrite and commercialKeys join existing owners in CODEBASE-MAP |
| 14 — dependencies/A03-A04 ownership | Resolved: WP-03 → WP-06 and C2/C5 added; foundation owns A03, build domain A04; acceptance ownership table added |
| 15 — signer/blocker/consent policy | Resolved in plan: P06/P07 prepare concrete policies and record unresolved material product rulings before dependent acceptance mutations. Existing approval may be cited; unrelated work continues |
| 16 — queue environment/metadata | Resolved: current enqueue-only authority, NOLOGIN distinction, supplied-client target and later dispatch authorization are explicit. Program metadata is a payload convention, not a new schema/queue. Team names do not go in restricted assignee; actor is not lease ownership |
| 17 — verification omissions | Resolved: affected verifier, local-only SQL endpoint, dedicated Playwright configs/full-file scanner caveat and .pw.ts exclusion stated. Manual AI dispatch’s bundle gap and integration coverage limits are recorded |
| 18 — token literals | Resolved: new production values enter via scoped house-sheet SPEC amendment and semantic mapping |
| 19 — review counts versus signers | Resolved: C4 names the distinction; existing count fields do not establish joint signatories |
| 20 — worktree tooling | Recommendation narrowed after source check: current skill explicitly uses .codex/worktrees/agent-*. Bootstrap validates linked/registered worktree, not the “Herdr” brand in its message. Handoff defers to assigned/current convention and keeps a valid example |
| 21 — fictional names | Resolved explicitly in acceptance fixtures/source register and brief: specimen identities are local-only, never production defaults |

The source checks also confirmed existing trade-scope acceptance and studio store purchases. Neither is treated as absent; neither is assumed to implement whole-service joint acceptance or GC-owned fabrication. Inspected source is not a statement about the live database.

## Follow-up independent review

The same separate-provider read-only review process checked the amended handoff in a fresh invocation. Its [follow-up report](review/claude-code-amendments-review.md) concluded: “the branch is ready to hand to the team starting WP-00,” with none of its remaining findings blocking WP-00. It found no new evidence reopening the 21 dispositions. The follow-up Markdown’s trailing whitespace was normalized; its findings are unchanged. The integration author then made these final documentation corrections:

| Follow-up finding | Disposition |
|---|---|
| 1 — acceptance backend/client dependency | Resolved: WP-10A owns and lands the record/RPC/projections first; WP-10C consumes it; WP-10B integrates completion/care after client sign-off. Table, diagram, briefs and acceptance owners agree |
| 2 — UI flag cannot gate RPC | Resolved: P12/ROLLOUT require inert or deny-by-default server activation, grant timing and direct-call tests before main integration. Main migrations must be safe without unfinished UI; deployment owner coordinates activation |
| 3 — preparation evidence auditability | Clarified: complete source paths/hashes already exist in current-source-inventory.json and reference paths in reference-manifest.json; linked explicitly below and in the check result. Added exact hash-check commands and gate outcomes; no runtime claim |
| 4 — WP-06 dependency breadth | Resolved: WP-03/C2/C5 gate only external-buying mutations; existing studio purchasing can proceed after its own contracts |
| 5 — navigation/drawer instructions | Resolved: app pointer and appended Document entry explicitly include D1/D8 navigation/drawer presence under P03 |
| 6 — unnumbered log entry | Kept as a uniquely dated program-approval pointer, consistent with existing unnumbered entries. It does not allocate a new numbered style ruling before the integration lead checks the latest log; P01/P02 amendments receive their own IDs when adopted |

## Preparation verification

Final machine-readable static check results are stored in [preparation-checks.json](evidence/preparation-checks.json). Complete input paths and hashes are in [current-source-inventory.json](evidence/current-source-inventory.json) and [reference-manifest.json](evidence/reference-manifest.json). Checks cover Markdown links in the primer, current-source inventory against the pinned baseline, frozen artifact hashes, Round 8 against its original commit, historical HTML/CSS resource paths and the preparation path boundary. Instruction-pointer additions are reviewed as documentation, not runtime changes.

From the repository root, reproduce the manifest hash/path checks with:

```bash
python3 - <<'PY_CHECK'
import hashlib, json, pathlib, subprocess
root = pathlib.Path.cwd()
base = root / 'docs/design/designer-portal-round8/evidence'
for filename in ('reference-manifest.json', 'current-source-inventory.json'):
    manifest = json.loads((base / filename).read_text())
    for item in manifest['files']:
        path = root / item['path']
        assert path.exists(), item['path']
        if 'baseline' in manifest:
            data = subprocess.check_output(['git', 'show', manifest['baseline'] + ':' + item['path']])
        else:
            data = path.read_bytes()
        assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
    print(filename, len(manifest['files']), 'passed')
PY_CHECK
```

Reference hashes are recomputed with Python `hashlib.sha256`; Round 8 bytes are compared with `git show e8f92b772b702303e560583bd57ab785a1974b73:<path>`, and source inventory bytes with `git show ee9c450a582bc677a635a7e451425db4e1e51b4a:<path>`. Local Markdown targets and HTML/CSS href/src/url targets are resolved relative to the containing file, excluding external/data/fragment-only references. This checks local paths, not every JavaScript-generated interaction or live URL.

Preparation gates completed successfully: `git diff --cached --check` on the new primer/instruction changes (after removing trailing whitespace in new documentation/review formatting) and `node scripts/hooks/patina-hooks.mjs policy --staged --strict` ("No hook findings"). Staging uses only explicit owned pathspecs. The archived history has one inherited whitespace-only line (`round2.js:103`); it is preserved deliberately to keep the frozen reference byte-identical. It is not a new primer whitespace defect.

No app build/type check, browser application walk, database replay, production status probe, CI dispatch or deployment was run for preparation. Prior mockup browser evidence stays in the frozen artifact’s own VERIFICATION.md. WP-00 owns the new runtime baseline; WP-10C and domain policy/compatibility decisions remain prerequisites for their later implementation, not unfinished branch preparation.
