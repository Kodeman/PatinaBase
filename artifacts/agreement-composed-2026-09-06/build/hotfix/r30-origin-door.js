export const meta = {
  name: 'agreement-r30-hotfix',
  description: 'The Agreement, Composed — R30 hotfix: the origin agreement reaches a homeowner with no project (client portal), build → adversarial review ≤2 → gates',
  phases: [
    { title: 'Build', detail: 'client-portal lane in its own worktree' },
    { title: 'Review', detail: 'adversarial review, fix loop ≤2' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const ROOT = REPO + '/artifacts/agreement-composed-2026-09-06'
const BUILD = ROOT + '/build'
const H = BUILD + '/hotfix'
const WT = REPO + '/.codex/worktrees/agent-agr-r30'
const BRANCH = 'agreement/r30-origin-door'
const DATE = (args && args.date) || '2026-09-07'

const GATE_ITEM = { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] }
const FINDING = { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, confidence: { type: 'number' }, file: { type: 'string' }, line: { type: 'integer' }, summary: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'confidence', 'file', 'summary', 'evidence'] }
const LANE_SCHEMA = { type: 'object', properties: { worktree: { type: 'string' }, branch: { type: 'string' }, headSha: { type: 'string' }, shipped: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, filesTouched: { type: 'array', items: { type: 'string' } }, gates: { type: 'array', items: GATE_ITEM }, migrations: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['worktree', 'branch', 'headSha', 'shipped', 'commits', 'gates', 'notes'] }
const REVIEW_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, gatesRun: { type: 'array', items: GATE_ITEM }, verdict: { type: 'string', enum: ['ship', 'fix', 'block'] }, notes: { type: 'string' } }, required: ['findings', 'gatesRun', 'verdict'] }

const STANDING = `
PROGRAM: "The Agreement, Composed" — R30 hotfix. Date ${DATE}. Wave 1 is on main (${'61a68919d'}) and in production. Read ${BUILD}/rulings-2026-09-06.md §R30 (binding: the facts, the mechanism, the scope) and ${BUILD}/contract.md §4. The investigation behind it cites: apps/client-portal/src/app/page.tsx:65-73 (zero projects → LetterboxDoor / ProjectsEmptyState), components/threshold/letterbox-door.tsx:52-58 (invoices only), lib/data/active-project.ts:102 (resolveHouseForInstrument drops ?proposal= when projectIds is empty), lib/retired-routes.ts:139-152 (/proposals/[id] → /?proposal=<id>#door), components/threshold/threshold.tsx:219,437-440 (project-scoped paper filter), migrations 00331:562-564 and 00566:11-15 (project_id NULL = the ORIGIN agreement by design; countersign creates the project), 00390:1178-1213 (guard_proposal_copy_immutability). Prod carries one sent origin agreement for a homeowner with a profile and zero projects — unreachable today.
SKILLS: load via the Skill tool before you start — patina-portal-features, patina-testing, patina-verification (and patina-db-migrations only if a migration proves necessary).
WORKTREE: ${WT} (branch ${BRANCH}, from origin/main). First command 'git -C ${WT} rev-parse --show-toplevel' and paste it. Absolute paths; never chain 'cd' with '&&' (a bare 'cd ${WT}' in its own Bash call before pnpm). Commit with explicit pathspecs; NEVER 'git add -A'; Conventional Commits; no trailers. Do NOT push. Do NOT run any production mutation. Do NOT touch .claude/, hooks, settings, or any .env file. Do NOT use SendMessage. Do NOT reset the shared local Supabase stack (it is at head 00575; use it read-only or via the client e2e harness which seeds its own rows). Sandbox: retry with dangerouslyDisableSandbox: true on sandbox evidence (git fetch/worktree add, pnpm install, playwright). Docs via Write/Edit only; program docs under ${BUILD}/ are gitignored — commit them with 'git add -f'.
SCOPE: exactly R30 — apps/client-portal only (plus @patina/types if a DTO field is needed; plus one minimal migration ONLY if get_client_commercial_document_bundle refuses project-less reads for the addressed homeowner — prove the refusal first, mint from 'ls supabase/migrations | sort | tail -1' + 1 and say so). No unrequested features, refactors, or abstractions. Homeowner copy: never "gate", "task", "dashboard", "overdue", "AI"; no badges, no numeric chips, no red/green status; the door renders the origin agreement exactly as a project-bound one does.
REPORT: FINAL action = the StructuredOutput tool call, even on failure. Evidence-grounded.
`

const IMPL = `You are the R30 HOTFIX implementer.${STANDING}
SETUP: 'git -C ${REPO} fetch origin main' (unsandboxed); 'git -C ${REPO} worktree add ${WT} -b ${BRANCH} origin/main' (unsandboxed); bare 'cd ${WT}' then 'pnpm install --frozen-lockfile' (unsandboxed) and 'pnpm turbo build --filter=@patina/client-portal^...'.
DELIVER: (1) with zero projects, the household door reads pending design_services proposals addressed to this homeowner (through the existing client-scoped read the Threshold uses for project papers — find it in hooks/use-commercial-client.ts / lib/data — widened to allow project_id IS NULL; prove with a SELECT against the local stack whether get_client_commercial_document_bundle already serves an origin agreement to its addressed homeowner) and renders it at #door with the same DoorGate/signature line/consent a project-bound agreement gets, so signing works end to end (sign route unchanged unless it refuses project-less documents — then the minimal branch); (2) resolveHouseForInstrument keeps ?proposal=<id> when the named proposal is an origin agreement addressed to this household and routes to that door instead of returning null; (3) the retired-route redirect lands there; (4) after countersign creates the project, nothing here double-renders (the project door takes over — prove with a test); (5) jest: zero-project door with a pending origin agreement renders the door and its consent line; resolveHouseForInstrument keeps the param; the no-agreement household still sees ProjectsEmptyState / LetterboxDoor; (6) an e2e touchpoint in apps/client-portal/tests seeded through the harness if the harness can create a project-less proposal (else document why not). Commit per item (fix(client): R30 — …).
GATES TO PASTE: bare 'cd ${WT}' then 'pnpm --filter @patina/client-portal type-check', 'pnpm --filter @patina/client-portal test:coverage' (floor 70/60/70/70), and — against a server you start with SUPABASE_SERVICE_ROLE_KEY from 'supabase status -o env' — 'npx playwright test --workers=1 tests/threshold.spec.ts' (plans-link:190, share-link:114, threshold:158 TZ and threshold:221 seed drift are pre-existing reds; anything else red is yours). Write ${H}/r30-notes.md (git add -f). Return StructuredOutput.`

function reviewBrief(round, prior) {
  return `You are the ADVERSARIAL REVIEWER for the R30 hotfix (round ${round + 1}). You did not write this code. Report EVERY finding with severity and confidence; never filter.${STANDING}
DIFF: 'git -C ${WT} log --oneline origin/main..HEAD' and 'git -C ${WT} diff origin/main...HEAD'.
----- IMPLEMENTER BRIEF -----
${IMPL}
----- END -----
${prior ? 'PRIOR ROUND FINDINGS (verify each is fixed; look for regressions):\n' + JSON.stringify(prior.findings, null, 1) : ''}
METHOD: trace the zero-project path in a real browser against the local stack (start the client portal from ${WT} on 3002 with the service-role key exported; seed a project-less design_services proposal addressed to a seeded homeowner via psql on postgresql://postgres:postgres@127.0.0.1:54322/postgres — do NOT reset; clean your rows after) and prove: the door renders the origin agreement, the consent line and signature act appear, signing calls sign_design_services_agreement_with_trusted_ip and writes commercial_document_signatures (SELECT), a stranger homeowner cannot read it (RLS through the bundle), the ?proposal= deep link and the retired /proposals/[id] redirect both land on it, and a household with no agreement is unchanged. Check the paper filter in threshold.tsx did not widen for project-bound households; check no homeowner-copy refusal; check pathspec-clean commits. RUN THE GATES yourself: client type-check, test:coverage, threshold e2e as above.
Severity: blocker = the origin agreement still unreachable or unsignable, RLS leak, red gate; major = real defect; minor; nit. Verdict 'ship' when no blocker and no major. Write ${H}/r30-review-r${round + 1}.md (git add -f + commit on ${BRANCH}); return StructuredOutput.`
}

function fixBrief(review, round) {
  const open = review.findings.filter(f => f.severity === 'blocker' || f.severity === 'major')
  return `You are the FIX agent for the R30 hotfix (round ${round + 1}). Fix every blocker and major below in ${WT} (branch ${BRANCH}); minors only when trivial.${STANDING}
FINDINGS:
${JSON.stringify(open, null, 1)}
Re-run the gates (client type-check, test:coverage, threshold e2e) and paste. Commit with pathspecs. Append to ${H}/r30-notes.md (git add -f). Return StructuredOutput with shipped=true only when every finding is addressed and gates are green.`
}

phase('Build')
const impl = await agent(IMPL, { label: 'build:r30', phase: 'Build', schema: LANE_SCHEMA, model: 'opus' })
if (!impl || !impl.shipped) { log('R30 implementer did not ship'); return { stage: 'build', impl } }
let head = impl.headSha, review = null, prior = null
phase('Review')
for (let round = 0; round < 2; round++) {
  review = await agent(reviewBrief(round, prior), { label: `review:r30 r${round + 1}`, phase: 'Review', schema: REVIEW_SCHEMA, model: 'opus' })
  if (!review) { log('reviewer returned nothing'); break }
  prior = review
  const open = review.findings.filter(f => f.severity === 'blocker' || f.severity === 'major')
  log(`r30 review r${round + 1} → ${review.verdict}, ${open.length} blocker/major of ${review.findings.length}`)
  if (open.length === 0 || round === 1) break
  const fix = await agent(fixBrief(review, round), { label: `fix:r30 r${round + 1}`, phase: 'Review', schema: LANE_SCHEMA, model: 'opus' })
  if (fix && fix.headSha) head = fix.headSha
  if (!fix) { log('fixer returned nothing'); break }
}
return { impl, head, review, worktree: WT, branch: BRANCH }
