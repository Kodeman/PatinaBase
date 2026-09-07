export const meta = {
  name: 'agreement-w1-close',
  description: 'The Agreement, Composed — Wave 1 close-out on the integration branch: ruled fixes, re-gate, rendered web walk with fix loop',
  phases: [
    { title: 'Fix', detail: 'R22–R29 on the integration branch' },
    { title: 'Re-gate', detail: 'independent reviewer runs every gate' },
    { title: 'Walk', detail: 'rendered web walk on both portals, fix ≤2' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const ROOT = REPO + '/artifacts/agreement-composed-2026-09-06'
const BUILD = ROOT + '/build'
const W1 = BUILD + '/waves/w1'
const WT = REPO + '/.codex/worktrees/agent-agr-w1-integration'
const BRANCH = 'agreement/w1-integration'
const HEAD = (args && args.head) || 'f1b0c31f16b1228de24cac55078b96a2a03538ba'
const DATE = (args && args.date) || '2026-09-07'

const GATE_ITEM = { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] }
const FINDING = { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, confidence: { type: 'number' }, file: { type: 'string' }, line: { type: 'integer' }, summary: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'confidence', 'file', 'summary', 'evidence'] }
const LANE_SCHEMA = { type: 'object', properties: { worktree: { type: 'string' }, branch: { type: 'string' }, headSha: { type: 'string' }, shipped: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, filesTouched: { type: 'array', items: { type: 'string' } }, gates: { type: 'array', items: GATE_ITEM }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['worktree', 'branch', 'headSha', 'shipped', 'commits', 'gates', 'notes'] }
const INTEGRATION_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, integrationSha: { type: 'string' }, gates: { type: 'array', items: GATE_ITEM }, findings: { type: 'array', items: FINDING }, migrations: { type: 'array', items: { type: 'string' } }, edgeFunctionsToDeploy: { type: 'array', items: { type: 'string' } }, portalsToDeploy: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'integrationSha', 'gates', 'findings', 'notes'] }
const WALK_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, walked: { type: 'array', items: { type: 'string' } }, evidence: { type: 'array', items: { type: 'string' } }, verdict: { type: 'string', enum: ['ship', 'fix', 'block'] }, notes: { type: 'string' } }, required: ['findings', 'walked', 'verdict'] }

const STANDING = `
PROGRAM: "The Agreement, Composed" — Wave 1 close-out. Date ${DATE}. Everything happens on the integration worktree ${WT} (branch ${BRANCH}); first command 'git -C ${WT} rev-parse --show-toplevel' and paste it. The local Supabase stack at 127.0.0.1:54322 is this program's; it currently carries the integration branch's 00575 — reset it only when you change the migration, and say so in ${W1}/stack-notice.md.
READ FIRST: ${BUILD}/rulings-2026-09-06.md — every section binds, the "Wave 1 close-out rulings" (R22–R29) most; ${BUILD}/contract.md; ${W1}/build-sheet.md; ${W1}/wave-report.md, ${W1}/integration-regate.md and the latest lane reviews (${W1}/backend-review-r4.md, client-review-r5.md, designer-review-r3.md) for the findings behind the rulings; ${W1}/env.md for the scratch-DB recipe (use 'pg_dump --no-owner -Fc' + 'pg_restore' — plain pg_dump|psql fails on the local pg 18 client).
SKILLS: load via the Skill tool before you start — patina-db-migrations, patina-portal-features, patina-testing, patina-verification.
REPO RULES: absolute paths; never chain 'cd' with '&&' (a bare 'cd ${WT}' in its own Bash call before pnpm turbo / pnpm --filter). Commit with explicit pathspecs; NEVER 'git add -A' or 'git add .'; Conventional Commits subjects; no trailers. Do NOT push. Do NOT run any production mutation. Do NOT touch .claude/, .agents/, hooks, settings, or any .env file. Do NOT use SendMessage. Do NOT create or remove worktrees. Sandbox: retry with dangerouslyDisableSandbox: true on sandbox evidence — docker, git fetch, pnpm install, playwright/chromium, run-sql-tests.sh (mktemp) and the supabase CLI need it. ALWAYS export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres before 'pnpm db:generate' (without it the script truncates database.types.ts to 0 bytes). Docs are written with the Write/Edit tools, never Bash heredocs. Program docs under ${BUILD}/ are gitignored — commit them with 'git add -f'.
VOCABULARY AND REFUSALS (binding on every string a designer or homeowner reads): Agreement · Part · Library · Template · Addendum; never "clause library", "contract builder", "variant", a database column name, or "AI" in UI text; homeowner copy never says "gate", "task", "dashboard" or "overdue"; no badges, no numeric count chips, no red/green status, no checkmark-as-status, no emoji; paper register only. Prose never carries money.
REPORT: FINAL action = the StructuredOutput tool call, even on failure. Evidence-grounded. 'advisories' never blocks you.
`

const FIX_BRIEF = `You are the CLOSE-OUT FIX agent for Wave 1 (head ${HEAD}). Implement R22–R29 exactly as ruled; nothing else. Edit 00575 in place where the ruling touches SQL (it is unapplied on Strata; keep the banner lineage current; graft every redefined function from its latest body with grep 'CREATE OR REPLACE FUNCTION[^(]*<name>' | sort | tail -1; re-pin any pinned hash in supabase/tests/edge_api/public_sd_hardening_contract_test.sql that changes; regenerate seed/00-legacy-grants.sql if grants change; regenerate types with SUPABASE_DB_URL exported). Commit per ruling with pathspecs (fix(agreements|document|client): R2N — …).${STANDING}
GATES (paste every one, in this order): 'supabase db reset --workdir ${WT}' (unsandboxed — you own the stack; append to ${W1}/stack-notice.md) then './scripts/run-sql-tests.sh' (unsandboxed) with its totals, plus psql -v ON_ERROR_STOP=1 -f on supabase/tests/commercial/agreement_parts_test.sql, agreement_parts_projection_test.sql and supabase/tests/edge_api/public_sd_hardening_contract_test.sql; 'SUPABASE_DB_URL=… pnpm db:generate' + 'git diff --exit-code packages/supabase/src/database.types.ts'; 'pnpm exec turbo build --filter=@patina/types --force'; @patina/types type-check; @patina/supabase type-check + test; designer-portal type-check + FULL jest (paste counts); client-portal type-check + test:coverage (floor 70/60/70/70); admin-portal build (unsandboxed; rm -rf apps/admin-portal/.next/types first). Append a "Close-out fixes (R22–R29)" section to ${W1}/wave-report.md (git add -f). Return StructuredOutput with shipped=true only when every ruling is implemented and every gate is green.`

function regateBrief(head) {
  return `You are the RE-GATE reviewer for the Wave 1 close-out (head ${head}). You did not write this code. For each of R22–R29 in ${BUILD}/rulings-2026-09-06.md quote the diff that implements it and judge fidelity; re-run the backend reviewer's probes R3 and Q5 (from ${W1}/backend-review-r4.md) and the earlier P16/P3b straight through the granted RPCs against the local stack (confirm schema_migrations head and that the 00575 body on the stack matches the branch by object probe; reset it yourself, unsandboxed, if it does not) and prove each now refuses; grep that no portal-local duplicate of the @patina/supabase agreement hooks remains and that the client body never reads serviceTerms when composed; confirm the seed for the composed e2e fixture exists and the §6.6 assertion is unconditional. Then run the full gate list (SQL suites, types diff with SUPABASE_DB_URL exported, @patina/types, @patina/supabase, designer type-check + FULL jest, client type-check + test:coverage, admin build unsandboxed) and the client e2e '--workers=1' with SUPABASE_SERVICE_ROLE_KEY from 'supabase status -o env' and NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true against a server YOU start with the override (the four named pre-existing e2e reds — plans-link:190, share-link:114, threshold:158 TZ, threshold:221 seed drift — do not count; anything else red does). Report EVERY finding with severity and confidence. ok=true only when every ruling holds, every probe refuses, and every gate is green. Write ${W1}/integration-regate-2.md (git add -f + commit on ${BRANCH}) and return StructuredOutput.${STANDING}`
}

function walkBrief(head, round, prior) {
  return `You are the WEB WALKER for Wave 1 (round ${round + 1}, head ${head}). Boot BOTH portals from ${WT} (see ${W1}/walk-env.md; if absent, derive: designer 3000 and client 3002 with NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true, keys from 'supabase status -o env', test-login tester@patina.cloud/000000 per prior programs' walk docs under ${REPO}/artifacts/*/build/waves/*/walk-env.md) against the LOCAL stack (do NOT reset), and walk in a real browser. No product code.${STANDING}
Boot with nohup (unsandboxed) so the servers survive your turn; wait for 127.0.0.1:3000 and :3002; kill what you started at the end and say so. Playwright headless chromium or the Chrome MCP tools; throwaway scripts under ${W1}/web-walk/; screenshots into ${W1}/web-walk-shots-r${round + 1}/ at 1280 and 390.
${prior ? 'PRIOR ROUND FINDINGS (re-verify):\n' + JSON.stringify(prior.findings, null, 1) : ''}
WALK: follow the 12-step walk script in ${W1}/build-sheet.md §9 exactly, proving each step with a screenshot and a SELECT where the sheet names one (parts rows, terms projection, fingerprint change, signature row, billing authority with the right ceiling). Add: (e) R17 — as a second studio member without the override, open the same draft in the seven-facet room and prove the one-sentence notice and disabled Save; (f) R24 — "Return to the seven facets" un-composes a draft and the seven-facet room saves again; (g) R22 — remove every fee part and prove send is refused in the room's words; (h) R25/R28 — the homeowner's page shows parts only, "Not yet set" for an unset money part, and no deposit line the designer never set. Then: (a) FLAG-OFF walk — restart the designer portal WITHOUT the override and prove the Contract Room renders today's seven facets with identical markup (compare against the flag-off snapshot test's stored markup); same for the client body. (b) Account → Studio: Agreement defaults card saves and re-reads; Billing card unchanged. (c) Vocabulary grep of rendered text on both portals (variant, column names, gate/task/overdue, "AI"). (d) axe on the Contract Room and the door — report violations.
Report every defect with screenshot paths; verdict 'ship' when no blocker and no major. Write ${W1}/walk-web-r${round + 1}.md (git add -f + commit on ${BRANCH}).`
}

function walkFixBrief(head, findings, round) {
  return `You are the WALK-FIX agent for Wave 1 (round ${round + 1}, head ${head}). Fix every blocker and major below in ${WT} (branch ${BRANCH}); commit with pathspecs; re-run the gates for what you touched (designer type-check + touched tests if apps/designer-portal; client type-check + test if apps/client-portal; if 00575 changes: supabase db reset + the three SQL suites + types regen with SUPABASE_DB_URL exported; @patina/supabase type-check if packages). Append to ${W1}/wave-report.md under "Walk fixes" (git add -f).${STANDING}
FINDINGS:
${JSON.stringify(findings, null, 1)}
Return StructuredOutput with shipped=true only when gates are green.`
}

phase('Fix')
const fix = await agent(FIX_BRIEF, { label: 'close-out fix', phase: 'Fix', schema: LANE_SCHEMA, model: 'opus' })
if (!fix || !fix.shipped) { log('close-out fix not shipped'); return { stage: 'fix', fix } }
let head = fix.headSha
log(`close-out fix shipped — ${head}`)

phase('Re-gate')
const regate = await agent(regateBrief(head), { label: 'S9c re-gate', phase: 'Re-gate', schema: INTEGRATION_SCHEMA, model: 'opus' })
if (!regate) { log('re-gate returned nothing'); return { stage: 'regate', fix } }
if (regate.integrationSha) head = regate.integrationSha
log(`re-gate ${regate.ok ? 'ok' : 'NOT ok'} — ${head}`)
const REGATE_FIX = (args && args.regateFix) || []
if (!regate.ok && !REGATE_FIX.length) return { stage: 'regate', fix, regate }
if (REGATE_FIX.length) {
  const rf = await agent(`You are the RE-GATE FIX agent for Wave 1 (head ${head}). Implement exactly the items below on ${WT} (branch ${BRANCH}); nothing else. Read ${W1}/integration-regate-2.md for the findings and ${BUILD}/rulings-2026-09-06.md ("R28 amended" and "Re-gate 2 minors") for the rulings. Edit 00575 in place if SQL changes (unapplied on Strata; banner lineage current; regenerate seed/00-legacy-grants.sql for any REVOKE; 'supabase db reset --workdir ${WT}' unsandboxed afterwards + the three SQL suites + 'SUPABASE_DB_URL=… pnpm db:generate' + diff check). Commit per item with pathspecs.${STANDING}
ITEMS:
- ${REGATE_FIX.join('\n- ')}
GATES TO PASTE: the SQL suites if 00575 changed; client-portal type-check + test:coverage; designer-portal type-check + touched tests; @patina/supabase type-check. Append to ${W1}/wave-report.md under "Re-gate 2 fixes" (git add -f). Return StructuredOutput with shipped=true only when every item is done and gates are green.`, { label: 're-gate fix', phase: 'Re-gate', schema: LANE_SCHEMA, model: 'opus' })
  if (rf && rf.headSha) head = rf.headSha
  if (!rf || !rf.shipped) { log('re-gate fix not shipped'); return { stage: 'regate-fix', fix, regate, rf } }
  log(`re-gate fix shipped — ${head}`)
}

phase('Walk')
let walks = [], prior = null
for (let round = 0; round < 2; round++) {
  const web = await agent(walkBrief(head, round, prior), { label: `walk:web r${round + 1}`, phase: 'Walk', schema: WALK_SCHEMA, model: 'opus' })
  walks.push({ round: round + 1, web }); prior = web
  const open = (web ? web.findings : []).filter(f => f.severity === 'blocker' || f.severity === 'major')
  log(`walk r${round + 1}: web=${web ? web.verdict : 'n/a'}, ${open.length} blocker/major`)
  if (open.length === 0 || round === 1) break
  const wf = await agent(walkFixBrief(head, open, round), { label: `walk-fix r${round + 1}`, phase: 'Walk', schema: LANE_SCHEMA, model: 'opus' })
  if (wf && wf.headSha) head = wf.headSha
  if (!wf) { log('walk fixer returned nothing'); break }
}
return { fix, regate, head, walks }
