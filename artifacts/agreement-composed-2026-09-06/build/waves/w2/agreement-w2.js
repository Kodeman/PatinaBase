export const meta = {
  name: 'agreement-w2',
  description: 'The Agreement, Composed — Wave 2 (the Library): steward, three lanes (backend, designer, client), adversarial review with fix loops, integration gates, web walk',
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
const W1 = BUILD + '/waves/w2'
const WT = REPO + '/.codex/worktrees'
const DATE = (args && args.date) || '2026-09-06'
const MINT_HINT = (args && args.mintFrom) || '00577'
const BASE_HINT = (args && args.baseSha) || '4c0b7b17b'

const LANES = [
  { key: 'backend', wt: WT + '/agent-agr-w2-backend', branch: 'agreement/w2-backend', kind: 'backend' },
  { key: 'designer', wt: WT + '/agent-agr-w2-designer', branch: 'agreement/w2-designer', kind: 'designer' },
  { key: 'client', wt: WT + '/agent-agr-w2-client', branch: 'agreement/w2-client', kind: 'client' },
]

const GATE_ITEM = { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] }
const FINDING = { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, confidence: { type: 'number' }, file: { type: 'string' }, line: { type: 'integer' }, summary: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'confidence', 'file', 'summary', 'evidence'] }
const STEWARD_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, baseSha: { type: 'string' }, mintFrom: { type: 'string' }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'baseSha', 'mintFrom', 'notes'] }
const LANE_SCHEMA = { type: 'object', properties: { worktree: { type: 'string' }, branch: { type: 'string' }, headSha: { type: 'string' }, shipped: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, filesTouched: { type: 'array', items: { type: 'string' } }, gates: { type: 'array', items: GATE_ITEM }, migrations: { type: 'array', items: { type: 'string' } }, deploySet: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['worktree', 'branch', 'headSha', 'shipped', 'commits', 'gates', 'notes'] }
const REVIEW_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, gatesRun: { type: 'array', items: GATE_ITEM }, verdict: { type: 'string', enum: ['ship', 'fix', 'block'] }, notes: { type: 'string' } }, required: ['findings', 'gatesRun', 'verdict'] }
const INTEGRATION_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, worktree: { type: 'string' }, branch: { type: 'string' }, integrationSha: { type: 'string' }, mainShaMerged: { type: 'string' }, merged: { type: 'array', items: { type: 'string' } }, conflictsResolved: { type: 'array', items: { type: 'string' } }, gates: { type: 'array', items: GATE_ITEM }, migrations: { type: 'array', items: { type: 'string' } }, edgeFunctionsToDeploy: { type: 'array', items: { type: 'string' } }, portalsToDeploy: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'worktree', 'branch', 'integrationSha', 'merged', 'gates', 'notes'] }
const WALK_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, walked: { type: 'array', items: { type: 'string' } }, evidence: { type: 'array', items: { type: 'string' } }, verdict: { type: 'string', enum: ['ship', 'fix', 'block'] }, notes: { type: 'string' } }, required: ['findings', 'walked', 'verdict'] }

const STANDING = `
PROGRAM: "The Agreement, Composed" — Wave 2 = the Library (P4 the Library · P5 fee schedules · P6 the client's copy from parts + execution snapshot · P7 addenda from parts · P8 change history). Date ${DATE}. Wave 1 is on main and in production. Flag 'agreement-library', fail-closed, and it only shows when 'agreement-parts' is also on; with either flag off both portals render exactly as Wave 1 shipped.
READ FIRST, in order: ${BUILD}/contract.md (binding shapes), ${BUILD}/rulings-2026-09-06.md (R1 R2 R3 R7 R8 R9 R12 bind this wave), ${W1}/build-sheet.md (your lane's exact file list, interfaces, tests, gates — deliver every item in your lane's section; its §0 findings and §3.4 graft rules and the pinned-hash re-pin rules are binding), ${BUILD}/waves/w1/wave-report.md and ${BUILD}/waves/w1/build-sheet.md §2.4 (what Wave 1 built — file names, RPCs, hooks), ${W1}/env.md (base sha, worktrees, mint numbers, stack ownership). Evidence for every codebase claim: ${ROOT}/research/04-codebase-today.md. The proposal: ${ROOT}/proposal.html.
SKILLS: load via the Skill tool before you start — backend: patina-db-migrations, patina-testing, patina-verification; designer/client: patina-portal-features, patina-testing, patina-verification.
REPO RULES: work ONLY inside your assigned worktree; first command 'git -C <wt> rev-parse --show-toplevel' and paste it. Absolute paths; never chain 'cd' with '&&' (a bare 'cd <wt>' in its own Bash call before pnpm turbo / pnpm --filter). Commit with explicit pathspecs; NEVER 'git add -A' or 'git add .'; Conventional Commits subjects; no 'merge(...)' subjects; no trailers. Do NOT push. Do NOT run any production mutation (no 'supabase db push', no 'supabase functions deploy', no wrangler deploy). Do NOT touch .claude/, .agents/, hooks, settings, or any .env file. Do NOT use SendMessage. Do NOT create or remove worktrees. Do NOT reset or write to the shared local Supabase stack during the build; the backend lane validates on a SCRATCH database; only the integration steward resets the shared stack. Sandbox: retry with dangerouslyDisableSandbox: true on sandbox evidence — docker, git fetch/worktree add, pnpm install, playwright/chromium and the supabase CLI need it here. Docs are written with the Write/Edit tools, never Bash heredocs (a hook blocks them).
VOCABULARY AND REFUSALS (binding on every string a designer or homeowner reads): Agreement · Part · Library · Template · Addendum (R7); never "clause library", "contract builder", "variant", a database column name, or "AI" in UI text; homeowner copy never says "gate", "task", "dashboard" or "overdue"; no badges, no numeric count chips, no red/green status, no checkmark-as-status, no emoji, no confetti; paper register only — do not restyle the deployed desk or the Billing card. Prose never carries money (R5): only schedule parts project into terms/authority.
SCOPE: exactly the items in your lane's section of the build sheet — no unrequested features, refactors, or abstractions. Tests for every behavior you change. Program docs under ${BUILD}/ are gitignored by the repo's 'build/' rule — commit them with 'git add -f'. Write a lane log at ${W1}/<lane>-notes.md and force-add + commit it.
REPORT: FINAL action = the StructuredOutput tool call, even on failure. Evidence-grounded (command output, diff stats, pass/fail counts). 'advisories' never blocks you.
`

const STEWARD_BRIEF = `You are the Wave 2 steward; no product code.${STANDING}
1. 'git -C ${REPO} fetch origin main' (unsandboxed). Base = the descendant of local main / origin/main; expected ${BASE_HINT} or a descendant. Confirm Wave 1 is on it: 'git log --oneline -12 <base>' shows the w1-integration merge, 'ls ${REPO}/supabase/migrations | tail -3' includes 00575_agreement_parts.sql (or its renumbered successor), and 'grep -rn "agreement-parts" ${REPO}/apps/designer-portal/src | head -2' finds the flag. If not, return ok=false.
2. Mint: highest 005NN on any ref ('git -C ${REPO} for-each-ref --format=%(refname)' then 'git ls-tree -r --name-only <ref> -- supabase/migrations | sort | tail -1' for every ref) plus one; expected ${MINT_HINT} (Wave 2 uses TWO consecutive numbers: mintFrom and mintFrom+1).
3. Worktrees on new branches from the base (unsandboxed): ${JSON.stringify(LANES.map(l => ({ wt: l.wt, branch: l.branch })))}.
4. Bootstrap every worktree: bare 'cd <wt>' then 'pnpm install --frozen-lockfile' (unsandboxed), then 'pnpm turbo build --filter=@patina/designer-portal^...' (designer), '--filter=@patina/client-portal^...' (client), '--filter=@patina/supabase^...' (backend). Paste the tail of each.
5. Local stack: 'supabase status --workdir ${REPO}' (unsandboxed) — confirm the stack is up and record 'select version from supabase_migrations.schema_migrations order by version desc limit 3' from postgresql://postgres:postgres@127.0.0.1:54322/postgres. Do NOT reset. Write ${W1}/stack-notice.md stating this program (agreement-w2) now owns the local stack, that lanes use scratch DBs, and that the integration steward will reset.
6. Write ${W1}/env.md: base sha, worktrees + branches, mintFrom (and mintFrom+1), local URLs (designer 3000, client 3002, supabase 54321/54322), the flag override 'NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true' (check use-feature-flag.ts's parseFlagOverride for the separator it accepts and write the exact syntax), service-role key from 'supabase status -o env' (for the walk; label it local-only), scratch-DB recipe (createdb patina_w1; pg_dump postgres | psql -d patina_w1; apply new migrations with psql -v ON_ERROR_STOP=1; dropdb at the end), and stack ownership. git add -f + commit both docs on main is NOT allowed — write them to disk only (the integration steward commits program docs).
7. Return ok=true only when everything above succeeded.`

function implBrief(lane) {
  const common = `${STANDING}\nYOUR WORKTREE: ${lane.wt}   YOUR BRANCH: ${lane.branch}. Read ${W1}/env.md.\n`
  if (lane.key === 'backend') return `You are the BACKEND lane for Wave 2. Deliver EVERY item in the build sheet's backend lane section: TWO migrations (mintFrom = the Library: studio_agreement_parts + agreement_templates transposed from board_templates 00408 with the R3 write rule, seeded patina.design_services / patina.consultation / patina.furnishings_services, RPCs save_agreement_part / save_agreement_as_template / materialize_agreement_template, agreement_part_events; mintFrom+1 = fee schedules: the four new columns on proposal_service_terms AND project_billing_authorities, the countersign graft from the 00566 head body, compose_agreement_consent, agreement_execution_snapshots + its renderer, the widened sign/countersign arguments with explicit DROP FUNCTION of the old arity + re-issued grants, NO new caller of app_private.issue_invoice_for_actor), every redefined function grafted from its latest body (grep 'CREATE OR REPLACE FUNCTION[^(]*<name>' | sort | tail -1), BOTH pinned hashes in supabase/tests/edge_api/public_sd_hardening_contract_test.sql re-pinned in the same change with the recompute commands the sheet gives, packages/types additions the sheet lists, proposal-send/handler.ts only if the sheet assigns it (then deno tests), @patina/supabase hooks (use-agreement-library.ts and the ones the sheet names) with query keys in the existing commercial family, SQL tests per the sheet, seed/00-legacy-grants.sql regenerated (python3 scripts/generate-legacy-grants.py) if you added any GRANT/REVOKE, types regenerated from the scratch DB, and the DECISIONS.md entry (R138, sheet §3.5) committed on your branch.${common}
SCRATCH DB (the shared stack is not yours): PGPASSWORD=postgres 'createdb -h 127.0.0.1 -p 54322 -U postgres patina_w1', 'pg_dump -h 127.0.0.1 -p 54322 -U postgres --no-owner --no-acl postgres | psql -h 127.0.0.1 -p 54322 -U postgres -d patina_w1' (unsandboxed), confirm 'select version from supabase_migrations.schema_migrations order by version desc limit 3' shows Wave 1's migration (if lower, apply the missing main migrations from your worktree first), apply your migrations in order with psql -v ON_ERROR_STOP=1 -f, run your SQL tests + the commercial/authority suites against postgresql://postgres:postgres@127.0.0.1:54322/patina_w1 (read scripts/run-sql-tests.sh for the variable it honors; run files directly with psql if it hard-codes the database), regenerate types from the scratch DB ('supabase gen types typescript --db-url postgresql://postgres:postgres@127.0.0.1:54322/patina_w1 > packages/supabase/src/database.types.ts'), drop the scratch DB at the end.
GATES TO PASTE: scratch-DB apply clean; every SQL test you ran with pass counts; 'pnpm --filter @patina/supabase type-check'; 'pnpm --filter @patina/types type-check'; types diff stat. Commit per item (feat(agreements): …).`
  if (lane.key === 'designer') return `You are the DESIGNER PORTAL lane for Wave 2. Deliver EVERY item in the build sheet's designer lane section: the schedules/ folder of typed editors with the authority chip ("creates authority" / "record only (R9)"), the M2 add-a-part picker from the Library and the template picker with its replace warning, save-as-template gated on admin/owner, the P8 history strip, the addendum-from-parts act with the why line (00569 pattern), and exactly ONE insertion into account-studio-page.tsx below the untouched Billing block for the Library card (M4). With 'agreement-library' off, Wave 1's room renders unchanged — prove with a snapshot test. Code against the backend lane's INTERFACES as the contract and build sheet §2 state them — the backend is building concurrently; stub only in tests.${common}
GATES TO PASTE: bare 'cd ${lane.wt}' then 'pnpm --filter @patina/designer-portal type-check', 'pnpm --filter @patina/designer-portal lint', 'pnpm --filter @patina/designer-portal test -- <touched test files>' AND the full 'pnpm --filter @patina/designer-portal test' once at the end (paste suite/test counts). Commit per item (feat(document): …).`
  return `You are the CLIENT PORTAL lane for Wave 2. Deliver EVERY item in the build sheet's client lane section: composeConsentLine beside the byte-identical legacy exports (zero money parts returns today's literal verbatim so the pinned blocks in consent-copy.test.ts keep passing), the canonical variant order the sheet fixes so SQL and TS agree, the full sentence table for the nine standard parts plus flat/per_phase, the twelve drift cases, attachment leaves with the required acknowledgment recorded through the sign route's widened argument, the keepsake at /proposals/[id]/record reading the frozen execution snapshot, jest with the coverage floor, and the e2e touchpoint the sheet names. Code against the backend INTERFACES per contract/build sheet.${common}
GATES TO PASTE: bare 'cd ${lane.wt}' then 'pnpm --filter @patina/client-portal type-check', 'pnpm --filter @patina/client-portal test' (coverage floor). Commit per item (feat(client): …).`
}

function gatesFor(lane) {
  if (lane.kind === 'designer') return "bare 'cd " + lane.wt + "' then 'pnpm --filter @patina/designer-portal type-check', 'lint', and the full 'test'. Diff the flag-off snapshot against main's markup yourself."
  if (lane.kind === 'client') return "bare 'cd " + lane.wt + "' then 'pnpm --filter @patina/client-portal type-check' and 'test' (coverage floor)."
  return "rebuild the scratch DB per env.md (createdb patina_w2r; pg_dump | psql; apply the lane's two migrations in order with psql -v ON_ERROR_STOP=1), run the lane's SQL tests, the commercial suites and public_sd_hardening_contract_test.sql against it, then probe: a seeded template cannot be updated or deleted by any role without the maintenance GUC; a studio member who is not admin/owner cannot write studio_agreement_parts or agreement_templates but can read them; materialize_agreement_template strips owner refs and lands parts in order; save_agreement_as_template from a sent proposal snapshots without mutating it; compose_agreement_consent for the nine standard parts, for flat, for per_phase, and for zero money parts (must equal today's literal); countersign under a flat and a per_phase agreement snapshots fee_basis/fee_amount_cents/fee_schedule/retainer_credit_rule on project_billing_authorities; the execution snapshot's document_hash equals _commercial_document_fingerprint at execution; the old-arity sign/countersign functions no longer exist (\\df) and grants are re-issued on the new arity; no function in the diff calls app_private.issue_invoice_for_actor; both pinned hashes in the contract test match. dropdb at the end. 'pnpm --filter @patina/supabase type-check'."
}

function reviewBrief(lane, round, prior) {
  return `You are the ADVERSARIAL REVIEWER for the Wave 2 ${lane.key} lane (round ${round + 1}). You did not write this code. Find what is wrong, missing, off-brief, off-contract, or off-vision, and prove it. Report EVERY finding with severity and confidence — never filter; the orchestrator filters.${STANDING}
WORKTREE: ${lane.wt} (branch ${lane.branch}). Diff: 'git -C ${lane.wt} log --oneline main..HEAD' and 'git -C ${lane.wt} diff main...HEAD'.
THE LANE BRIEF (every item must be delivered; a missing item is a blocker):
----- LANE BRIEF -----
${implBrief(lane)}
----- END LANE BRIEF -----
${prior ? 'PRIOR ROUND FINDINGS (verify each is fixed; look for regressions):\n' + JSON.stringify(prior.findings, null, 1) : ''}
METHOD: read the full diff; trace each build-sheet item; check every redefined SQL function against its latest prior body (grep|sort|tail -1) — a stale graft is a blocker; the Library transposes board_templates faithfully with the R3 write rule; seeded rows immutable; materialize strips owner refs; the consent composer agrees byte-for-byte between SQL and TS on the canonical variant order and returns today's literal for zero money parts; countersign snapshots the four new columns; the snapshot hash equals the fingerprint; DROP FUNCTION of old arities + re-issued grants; no new caller of app_private.issue_invoice_for_actor; both pinned hashes re-pinned; 'record only (R9)' variants never project; with agreement-library off, Wave 1's UI is byte-identical; no column names or "variant" in UI text; vocabulary refusals; tests assert behavior; nothing out of scope; pathspec-clean commits. RUN THE GATES YOURSELF and paste: ${gatesFor(lane)}
Severity: blocker = item missing/wrong, contract violated, refusal in UI copy, red gate, migration unsafe on Strata (stale graft, missing RLS/grant, unpinned search_path, bare extension fn); major = real defect; minor; nit. Verdict 'ship' when no blocker and no major. Write ${W1}/${lane.key}-review-r${round + 1}.md (git add -f + commit on the lane branch, docs(agreements): subject) and return StructuredOutput.`
}

function fixBrief(lane, review, round) {
  const open = review.findings.filter(f => f.severity === 'blocker' || f.severity === 'major')
  return `You are the FIX agent for the Wave 2 ${lane.key} lane (round ${round + 1}). Fix every blocker and major below in ${lane.wt} (branch ${lane.branch}); minors only when trivial. Check 'git -C ${lane.wt} status --short' first.${STANDING}
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
  return `You are the INTEGRATION steward for Wave 2. Merge the lanes, reconcile migrations, run every gate, prepare the walk. No product code except conflict resolution and renumbering.${STANDING}
LANE STATE (merge shipped lanes; majors ride as advisories; an open BLOCKER merges only if documented as accepted in ${W1}/<lane>-notes.md):
${JSON.stringify(summary, null, 1)}
STEPS: (1) fetch origin main (unsandboxed); tip = descendant; 'git -C ${REPO} worktree add ${WT}/agent-agr-w2-integration -b agreement/w2-integration <tip>'. (2) Merge --no-ff, subjects 'chore(agreements): merge w2-<lane>', order backend → designer → client; resolve minimally; list. (3) Migrations: re-check the tip's highest number; renumber OUR two files upward on collision, keeping them consecutive (filenames + banners + the lineage line in the second); never touch main's. Confirm the DECISIONS.md R138 entry is on the branch. (4) Bootstrap (bare cd; pnpm install --frozen-lockfile unsandboxed; turbo build designer-portal^... and client-portal^...). (5) GATES, paste all: append to ${W1}/stack-notice.md then 'supabase db reset' (unsandboxed, this steward owns the stack now) + scripts/run-sql-tests.sh (or the direct psql equivalent) incl. the new agreement tests and public_sd_hardening_contract_test.sql; 'pnpm db:generate' then 'git diff --exit-code packages/supabase/src/database.types.ts' (must be clean; if not, the lane forgot to regenerate — regenerate and commit); @patina/supabase type-check + test; @patina/types type-check; designer-portal type-check + lint + FULL jest (paste suite/test counts); client-portal type-check + test; admin-portal build (UNSANDBOXED — sandboxed produces a silent empty build; delete apps/admin-portal/.next/types first if type-check complains); deno: 'deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/' plus supabase/functions/proposal-send/ and 'deno check' on its index.ts if proposal-send changed (say whether it did); no deno.lock left. (6) Client e2e '--workers=1' with SUPABASE_SERVICE_ROLE_KEY exported from 'supabase status -o env' and the two-flag override from env.md (plans-link.spec / share-link.spec are pre-existing failures on main; everything else must pass) — paste the summary. (7) Deploy set over tip...HEAD (migrations above the tip's highest — two; edge functions = transitive importers of changed _shared ∪ changed dirs — proposal-send if touched; portals designer + client). (8) ${W1}/walk-env.md: boot recipe for designer (3000) and client (3002) from the integration worktree with the two-flag override, the seeded accounts (from ${REPO}/docs and prior programs' walk docs — tester@patina.cloud/000000 is the test-login precedent), service-role key (local-only). (9) ${W1}/wave-report.md — git add -f + commit.
Return ok=true only when every gate in 5–6 is green (excluding the two named pre-existing e2e failures).`
}

function webWalkBrief(integ, round, prior) {
  return `You are the WEB WALKER for Wave 2 (round ${round + 1}). Boot BOTH portals from ${integ.worktree} (see ${W1}/walk-env.md) against the LOCAL stack (do NOT reset) with the two-flag override from walk-env.md (agreement-parts and agreement-library both on), and walk in a real browser. No product code.${STANDING}
Boot with nohup (unsandboxed) so the servers survive your turn; wait for 127.0.0.1:3000 and :3002; kill what you started at the end and say so. Playwright headless chromium or the Chrome MCP tools; throwaway scripts under ${W1}/web-walk/; screenshots into ${W1}/web-walk-shots-r${round + 1}/ at 1280 and 390.
${prior ? 'PRIOR ROUND FINDINGS (re-verify):\n' + JSON.stringify(prior.findings, null, 1) : ''}
WALK: follow the 14-step two-studio walk script in ${W1}/build-sheet.md §9 exactly, proving each step with a screenshot and a SELECT where the sheet names one (template rows, materialized parts in order, per_phase projection, composed consent sentence on the door and on the signature row, authority fee_basis, execution snapshot hash, addendum why, part events). Then: (a) FLAG-OFF walk — restart the designer portal with only agreement-parts on and prove Wave 1's room renders with identical markup (no Library affordances); then with both flags off, today's seven facets; same for the client body. (b) Account → Studio: Library card lists the three seeded templates and the studio's saved one; an admin can edit, a plain member cannot; Billing card unchanged. (c) Vocabulary grep of rendered text on both portals (variant, column names, "clause library", gate/task/overdue, "AI"). (d) axe on the Contract Room, the Library card and the door — report violations.
Report every defect with screenshot paths; verdict 'ship' when no blocker and no major. Write ${W1}/walk-web-r${round + 1}.md (git add -f + commit on the integration branch).`
}

function walkFixBrief(integ, findings, round) {
  return `You are the WALK-FIX agent for Wave 2 (round ${round + 1}). Fix every blocker and major below directly in ${integ.worktree} (branch ${integ.branch}); commit with pathspecs; re-run the gates for what you touched (designer-portal type-check + touched tests if apps/designer-portal; client-portal type-check + test if apps/client-portal; SQL tests on a scratch DB if migrations — do NOT reset the shared stack mid-walk; @patina/supabase type-check if packages). Append to ${W1}/wave-report.md under "Walk fixes" (git add -f).${STANDING}
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
  const t0 = await agent(`You are the T0 TYPES agent for Wave 2 (the types-first handshake). Product code limited to packages/types.${STANDING}
IN ${LANES[0].wt} (branch ${LANES[0].branch}): apply ONLY the packages/types additions the Wave 2 build sheet lists (${W1}/build-sheet.md §2 lane ownership and "Cross-lane interfaces" — template/library DTOs, fee-schedule and consent types, snapshot and part-event types); Wave 1's agreement.ts already exists — extend it, never rewrite it; keep every existing export byte-identical. If the sheet lists no packages/types change, make no commit, run the type-check in all three worktrees, and return shipped=true with headSha = the current backend head. bare 'cd ${LANES[0].wt}' then 'pnpm --filter @patina/types type-check' and 'pnpm turbo build --filter=@patina/types' — paste both. Commit ONLY those files: 'feat(types): agreement parts vocabulary and payloads (T0)'. Then cherry-pick that commit onto the other two lane branches: 'git -C ${LANES[1].wt} cherry-pick <sha>' and 'git -C ${LANES[2].wt} cherry-pick <sha>' (unsandboxed if needed), and in each of those worktrees run bare 'cd <wt>' then 'pnpm turbo build --filter=@patina/types' — paste tails. Return StructuredOutput: headSha = the T0 commit sha on the backend branch; shipped=true only when all three worktrees carry it and the types dist is built in all three.`, { label: 'T0 types', phase: 'Steward', schema: LANE_SCHEMA, model: 'sonnet' })
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
