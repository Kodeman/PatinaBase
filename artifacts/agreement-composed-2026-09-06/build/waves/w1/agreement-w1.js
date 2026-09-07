export const meta = {
  name: 'agreement-w1',
  description: 'The Agreement, Composed — Wave 1 (loosen the room): steward, three lanes (backend, designer, client), adversarial review with fix loops, integration gates, web walk',
  phases: [
    { title: 'Steward', detail: 'worktrees from main, bootstrap, env' },
    { title: 'Build', detail: 'backend · designer · client' },
    { title: 'Review', detail: 'adversarial review per lane, fix loop ≤3' },
    { title: 'Integrate', detail: 'merge lanes, renumber, all gates' },
    { title: 'Walk', detail: 'rendered web walk on both portals, fix ≤2' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const ROOT = REPO + '/artifacts/agreement-composed-2026-09-06'
const BUILD = ROOT + '/build'
const W1 = BUILD + '/waves/w1'
const WT = REPO + '/.codex/worktrees'
const DATE = (args && args.date) || '2026-09-06'
const MINT_HINT = (args && args.mintFrom) || '00575'
const BASE_HINT = (args && args.baseSha) || '4c0b7b17b'

const LANES = [
  { key: 'backend', wt: WT + '/agent-agr-w1-backend', branch: 'agreement/w1-backend', kind: 'backend' },
  { key: 'designer', wt: WT + '/agent-agr-w1-designer', branch: 'agreement/w1-designer', kind: 'designer' },
  { key: 'client', wt: WT + '/agent-agr-w1-client', branch: 'agreement/w1-client', kind: 'client' },
]

const GATE_ITEM = { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] }
const FINDING = { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, confidence: { type: 'number' }, file: { type: 'string' }, line: { type: 'integer' }, summary: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'confidence', 'file', 'summary', 'evidence'] }
const STEWARD_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, baseSha: { type: 'string' }, mintFrom: { type: 'string' }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'baseSha', 'mintFrom', 'notes'] }
const LANE_SCHEMA = { type: 'object', properties: { worktree: { type: 'string' }, branch: { type: 'string' }, headSha: { type: 'string' }, shipped: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, filesTouched: { type: 'array', items: { type: 'string' } }, gates: { type: 'array', items: GATE_ITEM }, migrations: { type: 'array', items: { type: 'string' } }, deploySet: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['worktree', 'branch', 'headSha', 'shipped', 'commits', 'gates', 'notes'] }
const REVIEW_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, gatesRun: { type: 'array', items: GATE_ITEM }, verdict: { type: 'string', enum: ['ship', 'fix', 'block'] }, notes: { type: 'string' } }, required: ['findings', 'gatesRun', 'verdict'] }
const INTEGRATION_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, worktree: { type: 'string' }, branch: { type: 'string' }, integrationSha: { type: 'string' }, mainShaMerged: { type: 'string' }, merged: { type: 'array', items: { type: 'string' } }, conflictsResolved: { type: 'array', items: { type: 'string' } }, gates: { type: 'array', items: GATE_ITEM }, migrations: { type: 'array', items: { type: 'string' } }, edgeFunctionsToDeploy: { type: 'array', items: { type: 'string' } }, portalsToDeploy: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'worktree', 'branch', 'integrationSha', 'merged', 'gates', 'notes'] }
const WALK_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, walked: { type: 'array', items: { type: 'string' } }, evidence: { type: 'array', items: { type: 'string' } }, verdict: { type: 'string', enum: ['ship', 'fix', 'block'] }, notes: { type: 'string' } }, required: ['findings', 'walked', 'verdict'] }

const STANDING = `
PROGRAM: "The Agreement, Composed" — Wave 1 = loosen the room (P0 fix the floor · P1 parts on today's agreement · P2 readiness from composition · P3 studio agreement defaults). Date ${DATE}. Flag 'agreement-parts', fail-closed; FLAG-OFF MUST BE BYTE-IDENTICAL to today on both portals.
READ FIRST, in order: ${BUILD}/contract.md (binding shapes), ${BUILD}/rulings-2026-09-06.md (R1 R4 R5 R6 bind this wave), ${W1}/build-sheet.md (your lane's exact file list, interfaces, tests, gates — deliver every item in your lane's section), ${W1}/env.md (base sha, worktrees, mint number, stack ownership). Evidence for every codebase claim: ${ROOT}/research/04-codebase-today.md. The proposal: ${ROOT}/proposal.html.
SKILLS: load via the Skill tool before you start — backend: patina-db-migrations, patina-testing, patina-verification; designer/client: patina-portal-features, patina-testing, patina-verification.
REPO RULES: work ONLY inside your assigned worktree; first command 'git -C <wt> rev-parse --show-toplevel' and paste it. Absolute paths; never chain 'cd' with '&&' (a bare 'cd <wt>' in its own Bash call before pnpm turbo / pnpm --filter). Commit with explicit pathspecs; NEVER 'git add -A' or 'git add .'; Conventional Commits subjects; no 'merge(...)' subjects; no trailers. Do NOT push. Do NOT run any production mutation (no 'supabase db push', no 'supabase functions deploy', no wrangler deploy). Do NOT touch .claude/, .agents/, hooks, settings, or any .env file. Do NOT use SendMessage. Do NOT create or remove worktrees. Do NOT reset or write to the shared local Supabase stack during the build; the backend lane validates on a SCRATCH database; only the integration steward resets the shared stack. Sandbox: retry with dangerouslyDisableSandbox: true on sandbox evidence — docker, git fetch/worktree add, pnpm install, playwright/chromium and the supabase CLI need it here. Docs are written with the Write/Edit tools, never Bash heredocs (a hook blocks them).
VOCABULARY AND REFUSALS (binding on every string a designer or homeowner reads): Agreement · Part · Library · Template · Addendum (R7); never "clause library", "contract builder", "variant", a database column name, or "AI" in UI text; homeowner copy never says "gate", "task", "dashboard" or "overdue"; no badges, no numeric count chips, no red/green status, no checkmark-as-status, no emoji, no confetti; paper register only — do not restyle the deployed desk or the Billing card. Prose never carries money (R5): only schedule parts project into terms/authority.
SCOPE: exactly the items in your lane's section of the build sheet — no unrequested features, refactors, or abstractions. Tests for every behavior you change. Program docs under ${BUILD}/ are gitignored by the repo's 'build/' rule — commit them with 'git add -f'. Write a lane log at ${W1}/<lane>-notes.md and force-add + commit it.
REPORT: FINAL action = the StructuredOutput tool call, even on failure. Evidence-grounded (command output, diff stats, pass/fail counts). 'advisories' never blocks you.
`

const STEWARD_BRIEF = `You are the Wave 1 steward; no product code.${STANDING}
1. 'git -C ${REPO} fetch origin main' (unsandboxed). Base = the descendant of local main / origin/main; expected ${BASE_HINT} or a descendant. Confirm 'ls ${REPO}/supabase/migrations | tail -3' ends at 00574_invoice_links.sql (or higher — then mint above it).
2. Mint: highest 005NN on any ref ('git -C ${REPO} for-each-ref --format=%(refname)' then 'git ls-tree -r --name-only <ref> -- supabase/migrations | sort | tail -1' for every ref) plus one; expected ${MINT_HINT}.
3. Worktrees on new branches from the base (unsandboxed): ${JSON.stringify(LANES.map(l => ({ wt: l.wt, branch: l.branch })))}.
4. Bootstrap every worktree: bare 'cd <wt>' then 'pnpm install --frozen-lockfile' (unsandboxed), then 'pnpm turbo build --filter=@patina/designer-portal^...' (designer), '--filter=@patina/client-portal^...' (client), '--filter=@patina/supabase^...' (backend). Paste the tail of each.
5. Local stack: 'supabase status --workdir ${REPO}' (unsandboxed) — confirm the stack is up and record 'select version from supabase_migrations.schema_migrations order by version desc limit 3' from postgresql://postgres:postgres@127.0.0.1:54322/postgres. Do NOT reset. Write ${W1}/stack-notice.md stating this program (agreement-w1) now owns the local stack, that lanes use scratch DBs, and that the integration steward will reset.
6. Write ${W1}/env.md: base sha, worktrees + branches, mintFrom, local URLs (designer 3000, client 3002, supabase 54321/54322), the flag override 'NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true', service-role key from 'supabase status -o env' (for the walk; label it local-only), scratch-DB recipe (createdb patina_w1; pg_dump postgres | psql -d patina_w1; apply new migrations with psql -v ON_ERROR_STOP=1; dropdb at the end), and stack ownership. git add -f + commit both docs on main is NOT allowed — write them to disk only (the integration steward commits program docs).
7. Return ok=true only when everything above succeeded.`

function implBrief(lane) {
  const common = `${STANDING}\nYOUR WORKTREE: ${lane.wt}   YOUR BRANCH: ${lane.branch}. Read ${W1}/env.md.\n`
  if (lane.key === 'backend') return `You are the BACKEND lane for Wave 1. Deliver EVERY item in the build sheet's backend lane section: the single migration (mint from env.md's mintFrom; banner with lineage; proposal_agreement_parts + RLS + grants; guard_commercial_authored_child dispatch extended (graft from its latest body — grep 'CREATE OR REPLACE FUNCTION[^(]*guard_commercial_authored_child' | sort | tail -1); _commercial_document_fingerprint extended IN THIS MIGRATION (graft from its latest body); billing_ceiling_cents nullable with the refusals relaxed exactly as the sheet lists them, each grafted from its latest body; upsert_agreement_parts delegating the money projection to the current upsert_design_services_draft body — call it, never fork it; materialize_standard_parts; studio_agreement_defaults + RLS/grants; get_client_commercial_document_bundle extended with parts (graft from its latest body); re-pin public_sd_hardening_contract_test.sql hashes for every redefined function, 00563/00566 precedent), packages/types/src/agreement.ts per contract §1, @patina/supabase hooks (use-agreement-parts.ts, use-studio-agreement-defaults.ts) with query keys in the existing commercial family, SQL tests per the sheet, seed/00-legacy-grants.sql regenerated (python3 scripts/generate-legacy-grants.py) if you added any GRANT/REVOKE, types regenerated from the scratch DB.${common}
SCRATCH DB (the shared stack is not yours): PGPASSWORD=postgres 'createdb -h 127.0.0.1 -p 54322 -U postgres patina_w1', 'pg_dump -h 127.0.0.1 -p 54322 -U postgres --no-owner --no-acl postgres | psql -h 127.0.0.1 -p 54322 -U postgres -d patina_w1' (unsandboxed), confirm 'select version from supabase_migrations.schema_migrations order by version desc limit 3' shows 00574 (if lower, apply the missing main migrations from your worktree first), apply your migration with psql -v ON_ERROR_STOP=1 -f, run your SQL tests + the commercial/authority suites against postgresql://postgres:postgres@127.0.0.1:54322/patina_w1 (read scripts/run-sql-tests.sh for the variable it honors; run files directly with psql if it hard-codes the database), regenerate types from the scratch DB ('supabase gen types typescript --db-url postgresql://postgres:postgres@127.0.0.1:54322/patina_w1 > packages/supabase/src/database.types.ts'), drop the scratch DB at the end.
GATES TO PASTE: scratch-DB apply clean; every SQL test you ran with pass counts; 'pnpm --filter @patina/supabase type-check'; 'pnpm --filter @patina/types type-check'; types diff stat. Commit per item (feat(agreements): …).`
  if (lane.key === 'designer') return `You are the DESIGNER PORTAL lane for Wave 1. Deliver EVERY item in the build sheet's designer lane section: P0 DTO collapse onto packages/types (delete the app-local duplicates the sheet lists, redirect imports), the flag branch in service-agreement-drafting-room.tsx (flag-off path untouched — prove with a snapshot test that flag-off markup is unchanged from main), AgreementComposer (parts rail add/remove/reorder/rename, per-kind editors for the nine standard parts, readiness panel), assessAgreementReadiness with the R4 floor, the Account → Studio "Agreement defaults" card beside Billing (copy the Billing card's save-on-dirty pattern; do not restyle Billing), preview from parts, the "Not yet set" fix (never rendered on a sendable document), help-copy drift fix if the sheet assigns it to you. Code against the backend lane's INTERFACES as the contract and build sheet state them (RPC names/args, hook names, DTO shapes) — the backend is building concurrently; stub only in tests.${common}
GATES TO PASTE: bare 'cd ${lane.wt}' then 'pnpm --filter @patina/designer-portal type-check', 'pnpm --filter @patina/designer-portal lint', 'pnpm --filter @patina/designer-portal test -- <touched test files>' AND the full 'pnpm --filter @patina/designer-portal test' once at the end (paste suite/test counts). Commit per item (feat(document): …).`
  return `You are the CLIENT PORTAL lane for Wave 1. Deliver EVERY item in the build sheet's client lane section: bundle 'parts' consumption in lib/commercial-documents.ts + hooks, the DesignServicesBody branch in commercial-document-shell.tsx rendering parts in order when present (attachment kind handled as a separate leaf even though W1 seeds none; today's body unchanged when parts are absent — prove with a snapshot test), the sign route unchanged in W1 unless the sheet says otherwise, jest with the coverage floor, and an e2e touchpoint if the sheet names one. Code against the backend INTERFACES per contract/build sheet.${common}
GATES TO PASTE: bare 'cd ${lane.wt}' then 'pnpm --filter @patina/client-portal type-check', 'pnpm --filter @patina/client-portal test' (coverage floor). Commit per item (feat(client): …).`
}

function gatesFor(lane) {
  if (lane.kind === 'designer') return "bare 'cd " + lane.wt + "' then 'pnpm --filter @patina/designer-portal type-check', 'lint', and the full 'test'. Diff the flag-off snapshot against main's markup yourself."
  if (lane.kind === 'client') return "bare 'cd " + lane.wt + "' then 'pnpm --filter @patina/client-portal type-check' and 'test' (coverage floor)."
  return "rebuild the scratch DB per env.md (createdb patina_w1r; pg_dump | psql; apply the lane's migration with psql -v ON_ERROR_STOP=1), run the lane's SQL tests and the commercial suites against it, then probe: insert a part as a co-member (set role/claims via psql) → visible; as a non-member → not; send the document (send_commercial_document under the definer path) then try to UPDATE a part → check_violation; change a part before send → fingerprint differs; a proposal with a rate_card part and NULL ceiling → send refused; without rate_card → accepted; save the nine standard parts → proposal_service_terms row identical to what upsert_design_services_draft produces for the same inputs. dropdb at the end. 'pnpm --filter @patina/supabase type-check'."
}

function reviewBrief(lane, round, prior) {
  return `You are the ADVERSARIAL REVIEWER for the Wave 1 ${lane.key} lane (round ${round + 1}). You did not write this code. Find what is wrong, missing, off-brief, off-contract, or off-vision, and prove it. Report EVERY finding with severity and confidence — never filter; the orchestrator filters.${STANDING}
WORKTREE: ${lane.wt} (branch ${lane.branch}). Diff: 'git -C ${lane.wt} log --oneline main..HEAD' and 'git -C ${lane.wt} diff main...HEAD'.
THE LANE BRIEF (every item must be delivered; a missing item is a blocker):
----- LANE BRIEF -----
${implBrief(lane)}
----- END LANE BRIEF -----
${prior ? 'PRIOR ROUND FINDINGS (verify each is fixed; look for regressions):\n' + JSON.stringify(prior.findings, null, 1) : ''}
METHOD: read the full diff; trace each build-sheet item; check every redefined SQL function against its latest prior body (grep|sort|tail -1) — a stale graft is a blocker; fingerprint covers every part; guard freezes parts at send; RLS admits co-members only; projection parity with upsert_design_services_draft; NULL ceiling semantics exactly as the contract; flag-off byte-identity on both portals; readiness cannot be green with a required part empty; no column names or "variant" in UI text; vocabulary refusals; tests assert behavior; nothing out of scope; pathspec-clean commits. RUN THE GATES YOURSELF and paste: ${gatesFor(lane)}
Severity: blocker = item missing/wrong, contract violated, refusal in UI copy, red gate, migration unsafe on Strata (stale graft, missing RLS/grant, unpinned search_path, bare extension fn); major = real defect; minor; nit. Verdict 'ship' when no blocker and no major. Write ${W1}/${lane.key}-review-r${round + 1}.md (git add -f + commit on the lane branch, docs(agreements): subject) and return StructuredOutput.`
}

function fixBrief(lane, review, round) {
  const open = review.findings.filter(f => f.severity === 'blocker' || f.severity === 'major')
  return `You are the FIX agent for the Wave 1 ${lane.key} lane (round ${round + 1}). Fix every blocker and major below in ${lane.wt} (branch ${lane.branch}); minors only when trivial. Check 'git -C ${lane.wt} status --short' first.${STANDING}
ORIGINAL LANE BRIEF:
----- LANE BRIEF -----
${implBrief(lane)}
----- END LANE BRIEF -----
FINDINGS TO FIX:
${JSON.stringify(open, null, 1)}
Re-run the lane's gates and paste them. Commit with pathspecs. Append to ${W1}/${lane.key}-notes.md (git add -f). Return StructuredOutput with shipped=true only when every finding is addressed and gates are green.`
}

async function reviewLoop(lane, s) {
  let prior = null
  for (let round = 0; round < 3; round++) {
    const review = await agent(reviewBrief(lane, round, prior), { label: `review:${lane.key} r${round + 1}`, phase: 'Review', schema: REVIEW_SCHEMA, model: 'opus' })
    if (!review) { log(`${lane.key}: reviewer r${round + 1} returned nothing`); break }
    s.review = review; s.rounds = round + 1; prior = review
    const open = review.findings.filter(f => f.severity === 'blocker' || f.severity === 'major')
    log(`${lane.key}: review r${round + 1} → ${review.verdict}, ${open.length} blocker/major of ${review.findings.length}`)
    if (open.length === 0 || round === 2) break
    const fix = await agent(fixBrief(lane, review, round), { label: `fix:${lane.key} r${round + 1}`, phase: 'Review', schema: LANE_SCHEMA, model: 'opus' })
    if (fix) { s.fixes.push(fix); s.lastLane = fix } else log(`${lane.key}: fixer returned nothing`)
  }
  return s
}

function integrationBrief(lanes) {
  const summary = lanes.map(s => ({ key: s.lane.key, branch: s.lane.branch, worktree: s.lane.wt, headSha: s.lastLane && s.lastLane.headSha, shipped: !!(s.lastLane && s.lastLane.shipped), reviewVerdict: s.review ? s.review.verdict : 'none', openFindings: s.review ? s.review.findings.filter(f => f.severity === 'blocker' || f.severity === 'major').map(f => f.id + ': ' + f.summary) : [], migrations: (s.lastLane && s.lastLane.migrations) || [], deploySet: (s.lastLane && s.lastLane.deploySet) || [] }))
  return `You are the INTEGRATION steward for Wave 1. Merge the lanes, reconcile migrations, run every gate, prepare the walk. No product code except conflict resolution and renumbering.${STANDING}
LANE STATE (merge shipped lanes; majors ride as advisories; an open BLOCKER merges only if documented as accepted in ${W1}/<lane>-notes.md):
${JSON.stringify(summary, null, 1)}
STEPS: (1) fetch origin main (unsandboxed); tip = descendant; 'git -C ${REPO} worktree add ${WT}/agent-agr-w1-integration -b agreement/w1-integration <tip>'. (2) Merge --no-ff, subjects 'chore(agreements): merge w1-<lane>', order backend → designer → client; resolve minimally; list. (3) Migrations: re-check the tip's highest number; renumber OUR file upward on collision (filename + banner); never touch main's. (4) Bootstrap (bare cd; pnpm install --frozen-lockfile unsandboxed; turbo build designer-portal^... and client-portal^...). (5) GATES, paste all: append to ${W1}/stack-notice.md then 'supabase db reset' (unsandboxed, this steward owns the stack now) + scripts/run-sql-tests.sh (or the direct psql equivalent) incl. the new agreement tests and public_sd_hardening_contract_test.sql; 'pnpm db:generate' then 'git diff --exit-code packages/supabase/src/database.types.ts' (must be clean; if not, the lane forgot to regenerate — regenerate and commit); @patina/supabase type-check + test; @patina/types type-check; designer-portal type-check + lint + FULL jest (paste suite/test counts); client-portal type-check + test; admin-portal build (UNSANDBOXED — sandboxed produces a silent empty build; delete apps/admin-portal/.next/types first if type-check complains); deno: 'deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/' only if any supabase/functions file changed (expected none — say so). (6) Client e2e '--workers=1' with SUPABASE_SERVICE_ROLE_KEY exported from 'supabase status -o env' and NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true (plans-link.spec / share-link.spec are pre-existing failures on main; everything else must pass) — paste the summary. (7) Deploy set over tip...HEAD (migrations above the tip's highest; edge functions = transitive importers of changed _shared ∪ changed dirs — expected none; portals designer + client). (8) ${W1}/walk-env.md: boot recipe for designer (3000) and client (3002) from the integration worktree with the flag override, the seeded accounts (from ${REPO}/docs and prior programs' walk docs — tester@patina.cloud/000000 is the test-login precedent), service-role key (local-only). (9) ${W1}/wave-report.md — git add -f + commit.
Return ok=true only when every gate in 5–6 is green (excluding the two named pre-existing e2e failures).`
}

function webWalkBrief(integ, round, prior) {
  return `You are the WEB WALKER for Wave 1 (round ${round + 1}). Boot BOTH portals from ${integ.worktree} (see ${W1}/walk-env.md) against the LOCAL stack (do NOT reset) with NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true, and walk in a real browser. No product code.${STANDING}
Boot with nohup (unsandboxed) so the servers survive your turn; wait for 127.0.0.1:3000 and :3002; kill what you started at the end and say so. Playwright headless chromium or the Chrome MCP tools; throwaway scripts under ${W1}/web-walk/; screenshots into ${W1}/web-walk-shots-r${round + 1}/ at 1280 and 390.
${prior ? 'PRIOR ROUND FINDINGS (re-verify):\n' + JSON.stringify(prior.findings, null, 1) : ''}
WALK: follow the 12-step walk script in ${W1}/build-sheet.md §9 exactly, proving each step with a screenshot and a SELECT where the sheet names one (parts rows, terms projection, fingerprint change, signature row, billing authority with the right ceiling). Then: (a) FLAG-OFF walk — restart the designer portal WITHOUT the override and prove the Contract Room renders today's seven facets with identical markup (compare the DOM of the room against a main-checkout render if feasible, else against the flag-off snapshot test's stored markup); same for the client body. (b) Account → Studio: Agreement defaults card saves and re-reads; Billing card unchanged. (c) Vocabulary grep of rendered text on both portals (variant, column names, gate/task/overdue, "AI"). (d) axe on the Contract Room and the door — report violations.
Report every defect with screenshot paths; verdict 'ship' when no blocker and no major. Write ${W1}/walk-web-r${round + 1}.md (git add -f + commit on the integration branch).`
}

function walkFixBrief(integ, findings, round) {
  return `You are the WALK-FIX agent for Wave 1 (round ${round + 1}). Fix every blocker and major below directly in ${integ.worktree} (branch ${integ.branch}); commit with pathspecs; re-run the gates for what you touched (designer-portal type-check + touched tests if apps/designer-portal; client-portal type-check + test if apps/client-portal; SQL tests on a scratch DB if migrations — do NOT reset the shared stack mid-walk; @patina/supabase type-check if packages). Append to ${W1}/wave-report.md under "Walk fixes" (git add -f).${STANDING}
FINDINGS:
${JSON.stringify(findings, null, 1)}
Return StructuredOutput with shipped=true only when gates are green.`
}

// ---------------- run ----------------
const PHASE = (args && args.phase) || 'all'
let steward = null
if (PHASE === 'all' || PHASE === 'lanes') {
  phase('Steward')
  steward = await agent(STEWARD_BRIEF, { label: 'S0 steward', phase: 'Steward', schema: STEWARD_SCHEMA, model: 'sonnet' })
  if (!steward || !steward.ok) { log('Steward failed or not ok; stopping.'); return { stage: 'steward', steward } }
  log(`Steward ok — base ${steward.baseSha}, mint from ${steward.mintFrom}`)
  const t0 = await agent(`You are the T0 TYPES agent for Wave 1 (build-sheet §2.0 handshake). Product code limited to packages/types.${STANDING}
IN ${LANES[0].wt} (branch ${LANES[0].branch}): create packages/types/src/agreement.ts exactly per ${BUILD}/contract.md §1 and ${W1}/build-sheet.md §2.4 (the frozen cross-lane interface — it is normative), apply the packages/types/src/commercial.ts edits from build-sheet §4.6 that belong to packages/types, and add the export line to packages/types/src/index.ts. bare 'cd ${LANES[0].wt}' then 'pnpm --filter @patina/types type-check' and 'pnpm turbo build --filter=@patina/types' — paste both. Commit ONLY those files: 'feat(types): agreement parts vocabulary and payloads (T0)'. Then cherry-pick that commit onto the other two lane branches: 'git -C ${LANES[1].wt} cherry-pick <sha>' and 'git -C ${LANES[2].wt} cherry-pick <sha>' (unsandboxed if needed), and in each of those worktrees run bare 'cd <wt>' then 'pnpm turbo build --filter=@patina/types' — paste tails. Return StructuredOutput: headSha = the T0 commit sha on the backend branch; shipped=true only when all three worktrees carry it and the types dist is built in all three.`, { label: 'T0 types', phase: 'Steward', schema: LANE_SCHEMA, model: 'sonnet' })
  if (!t0 || !t0.shipped) { log('T0 types handshake failed; stopping.'); return { stage: 't0', steward, t0 } }
  log(`T0 types landed — ${t0.headSha}`)
}

phase('Build')
const laneStates = (PHASE === 'integrate') ? (args.laneStates || []).map(x => ({ lane: LANES.find(l => l.key === x.key) || { key: x.key, branch: x.branch, wt: x.wt }, lastLane: { headSha: x.head, shipped: x.shipped, migrations: x.migrations || [], deploySet: x.deploySet || [] }, review: x.verdict ? { verdict: x.verdict, findings: x.open || [] } : null, rounds: x.rounds || 0 })) : await pipeline(LANES,
  async (lane) => {
    const impl = await agent(implBrief(lane), { label: `build:${lane.key}`, phase: 'Build', schema: LANE_SCHEMA, model: 'opus' })
    let s = { lane, impl, lastLane: impl, review: null, fixes: [], rounds: 0 }
    if (!impl) { log(`${lane.key}: implementer returned nothing`); return { ...s, status: 'impl-null' } }
    s = await reviewLoop(lane, s)
    return { ...s, status: 'reviewed' }
  }
)
const lanes = laneStates.filter(Boolean)
lanes.forEach(s => log(`${s.lane.key}: head ${(s.lastLane && s.lastLane.headSha) || 'none'}, shipped=${!!(s.lastLane && s.lastLane.shipped)}, verdict=${s.review ? s.review.verdict : 'none'}`))
const laneSummary = () => lanes.map(s => ({ key: s.lane.key, branch: s.lane.branch, wt: s.lane.wt, head: s.lastLane && s.lastLane.headSha, shipped: !!(s.lastLane && s.lastLane.shipped), verdict: s.review && s.review.verdict, rounds: s.rounds, open: s.review ? s.review.findings.filter(f => f.severity !== 'nit') : [], migrations: s.lastLane && s.lastLane.migrations, deploySet: s.lastLane && s.lastLane.deploySet, advisories: s.lastLane && s.lastLane.advisories }))
if (PHASE === 'lanes') return { phase: 'lanes', steward, lanes: laneSummary() }

phase('Integrate')
const integ = await agent(integrationBrief(lanes), { label: 'S9 integration', phase: 'Integrate', schema: INTEGRATION_SCHEMA, model: 'opus' })
if (!integ) { log('integration returned nothing'); return { steward, lanes: laneSummary() } }
log(`Integration ${integ.ok ? 'ok' : 'NOT ok'} — ${integ.integrationSha}`)

const INTEGRATE_CARRY = (args && args.integrateCarry) || []
if (INTEGRATE_CARRY.length) {
  const carry = await agent(`You are the CARRY-FIX agent for Wave 1: close the orchestrator-ruled items below directly in ${integ.worktree} (branch ${integ.branch}, head ${integ.integrationSha}). Read ${BUILD}/rulings-2026-09-06.md — the "Wave 1 integration rulings" section (R17–R21) is binding and names the mechanisms. Read the three round-3 reviews (${W1}/backend-review-r3.md, designer-review-r3.md, client-review-r3.md) for the exact findings and probes. Commit per item with pathspecs (feat/fix(agreements|document|client): …). Edit 00575 in place (it is unapplied on Strata) and keep its banner lineage current; graft every redefined function from its latest body; re-pin the contract-test hash if a pinned body changes; regenerate seed/00-legacy-grants.sql if grants change; regenerate types if the schema changes.${STANDING}
ITEMS:
- ${INTEGRATE_CARRY.join('\n- ')}
GATES (paste every one): rebuild the local stack — you are the integration steward's successor and own it — 'supabase db reset' (unsandboxed) then psql -v ON_ERROR_STOP=1 -f on supabase/tests/commercial/agreement_parts_test.sql, agreement_parts_projection_test.sql and supabase/tests/edge_api/public_sd_hardening_contract_test.sql (and the new R17 test); 'pnpm db:generate' + 'git diff --exit-code packages/supabase/src/database.types.ts'; @patina/supabase type-check + test; @patina/types type-check; designer-portal type-check + FULL jest (paste counts); client-portal type-check + test (coverage floor); admin-portal build (unsandboxed). Append a "Carry fixes" section to ${W1}/wave-report.md and a round-4 acceptance note to ${W1}/backend-notes.md (git add -f). Return StructuredOutput with shipped=true only when every item is done and every gate is green.`, { label: 'carry-fix', phase: 'Integrate', schema: LANE_SCHEMA, model: 'opus' })
  if (carry && carry.headSha) { integ.integrationSha = carry.headSha; log(`carry-fix ${carry.shipped ? 'shipped' : 'NOT shipped'} at ${carry.headSha}`) } else log('carry-fix returned nothing')
  const regate = await agent(`You are the RE-GATE reviewer for Wave 1 after the carry-fix (head ${integ.integrationSha}, worktree ${integ.worktree}, branch ${integ.branch}). You did not write this code. Verify each ruled item R17–R21 in ${BUILD}/rulings-2026-09-06.md is implemented as ruled (quote the diff), re-run the reviewer probes P16 and P3b from ${W1}/backend-review-r3.md against the local stack (do NOT reset; it is at the carry-fix head — confirm with schema_migrations) and prove both now refuse, then run the full gate list from the integration brief (SQL suites incl. the new R17 test, types diff, @patina/supabase, @patina/types, designer type-check + FULL jest, client type-check + test, admin build unsandboxed) and paste each. Report EVERY finding with severity and confidence. Return INTEGRATION-shaped StructuredOutput: ok=true only when every ruled item holds, both probes refuse, and every gate is green (the four e2e failures named as pre-existing in the integration report do not count). Write ${W1}/integration-regate.md (git add -f + commit on the integration branch).${STANDING}`, { label: 'S9b re-gate', phase: 'Integrate', schema: INTEGRATION_SCHEMA, model: 'opus' })
  if (regate) { integ.ok = !!regate.ok; if (regate.integrationSha) integ.integrationSha = regate.integrationSha; integ.gates = (integ.gates || []).concat(regate.gates || []); integ.advisories = (integ.advisories || []).concat(regate.advisories || []); log(`re-gate ${regate.ok ? 'ok' : 'NOT ok'} — ${regate.integrationSha}`) } else log('re-gate returned nothing')
}

let walks = []
if (integ.ok) {
  phase('Walk')
  let prior = null
  for (let round = 0; round < 2; round++) {
    const web = await agent(webWalkBrief(integ, round, prior), { label: `walk:web r${round + 1}`, phase: 'Walk', schema: WALK_SCHEMA, model: 'opus' })
    walks.push({ round: round + 1, web }); prior = web
    const open = (web ? web.findings : []).filter(f => f.severity === 'blocker' || f.severity === 'major')
    log(`walk r${round + 1}: web=${web ? web.verdict : 'n/a'}, ${open.length} blocker/major`)
    if (open.length === 0 || round === 1) break
    const fix = await agent(walkFixBrief(integ, open, round), { label: `walk-fix r${round + 1}`, phase: 'Walk', schema: LANE_SCHEMA, model: 'opus' })
    if (fix && fix.headSha) integ.integrationSha = fix.headSha
    if (!fix) { log('walk fixer returned nothing'); break }
  }
}

return { steward, lanes: laneSummary(), integration: integ, walks }
