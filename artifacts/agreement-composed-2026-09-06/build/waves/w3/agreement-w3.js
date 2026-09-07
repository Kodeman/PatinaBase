export const meta = {
  name: 'agreement-w3',
  description: 'The Agreement, Composed — Wave 3 (turnkey): steward, five lanes (backend, designer, client), adversarial review with fix loops, integration gates, web walk',
  phases: [
    { title: 'Steward', detail: 'worktrees from main, bootstrap, env' },
    { title: 'Build', detail: 'backend · designer · client · edge · sub' },
    { title: 'Review', detail: 'adversarial review per lane, fix loop ≤3' },
    { title: 'Integrate', detail: 'merge lanes, renumber, all gates' },
    { title: 'Walk', detail: 'rendered web walk on both portals, fix ≤2' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const ROOT = REPO + '/artifacts/agreement-composed-2026-09-06'
const BUILD = ROOT + '/build'
const W1 = BUILD + '/waves/w3'
const WT = REPO + '/.codex/worktrees'
const DATE = (args && args.date) || '2026-09-06'
const MINT_HINT = (args && args.mintFrom) || '00579'
const BASE_HINT = (args && args.baseSha) || '4c0b7b17b'

const LANES = [
  { key: 'backend', wt: WT + '/agent-agr-w3-backend', branch: 'agreement/w3-backend', kind: 'backend' },
  { key: 'designer', wt: WT + '/agent-agr-w3-designer', branch: 'agreement/w3-designer', kind: 'designer' },
  { key: 'client', wt: WT + '/agent-agr-w3-client', branch: 'agreement/w3-client', kind: 'client' },
  { key: 'edge', wt: WT + '/agent-agr-w3-edge', branch: 'agreement/w3-edge', kind: 'edge' },
  { key: 'sub', wt: WT + '/agent-agr-w3-sub', branch: 'agreement/w3-sub', kind: 'sub' },
]

const GATE_ITEM = { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] }
const FINDING = { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] }, confidence: { type: 'number' }, file: { type: 'string' }, line: { type: 'integer' }, summary: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'confidence', 'file', 'summary', 'evidence'] }
const STEWARD_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, baseSha: { type: 'string' }, mintFrom: { type: 'string' }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'baseSha', 'mintFrom', 'notes'] }
const LANE_SCHEMA = { type: 'object', properties: { worktree: { type: 'string' }, branch: { type: 'string' }, headSha: { type: 'string' }, shipped: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, filesTouched: { type: 'array', items: { type: 'string' } }, gates: { type: 'array', items: GATE_ITEM }, migrations: { type: 'array', items: { type: 'string' } }, deploySet: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['worktree', 'branch', 'headSha', 'shipped', 'commits', 'gates', 'notes'] }
const REVIEW_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, gatesRun: { type: 'array', items: GATE_ITEM }, verdict: { type: 'string', enum: ['ship', 'fix', 'block'] }, notes: { type: 'string' } }, required: ['findings', 'gatesRun', 'verdict'] }
const INTEGRATION_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, worktree: { type: 'string' }, branch: { type: 'string' }, integrationSha: { type: 'string' }, mainShaMerged: { type: 'string' }, merged: { type: 'array', items: { type: 'string' } }, conflictsResolved: { type: 'array', items: { type: 'string' } }, gates: { type: 'array', items: GATE_ITEM }, migrations: { type: 'array', items: { type: 'string' } }, edgeFunctionsToDeploy: { type: 'array', items: { type: 'string' } }, portalsToDeploy: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' }, advisories: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'worktree', 'branch', 'integrationSha', 'merged', 'gates', 'notes'] }
const WALK_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, walked: { type: 'array', items: { type: 'string' } }, evidence: { type: 'array', items: { type: 'string' } }, verdict: { type: 'string', enum: ['ship', 'fix', 'block'] }, notes: { type: 'string' } }, required: ['findings', 'walked', 'verdict'] }

const STANDING = `
PROGRAM: "The Agreement, Composed" — Wave 3 = turnkey (P9 the design-build class · P10 licensing attestation · P11 jurisdiction attachments, seeded and DISABLED · P12 lien waivers per draw · P13 sign then offer the deposit, never gate · P14 the subcontract: Trade Agreement, studio↔sub, token-signed). Date ${DATE}. Waves 1 and 2 are on main and in production. Flag 'design-build', fail-closed, shown only when 'agreement-parts' and 'agreement-library' are also on; with it off both portals render exactly as Wave 2 shipped. Nothing verifies a license; notices and the flow-down clause ship with enabled=false and no UI to enable them; no PDF; zero new Stripe code (the deposit is a link to the shipped /pay/[token] surface, minted by a separate failable call AFTER the signature commits).
READ FIRST, in order: ${BUILD}/contract.md (binding shapes), ${BUILD}/rulings-2026-09-06.md (R10 R11 R13 R15 R16 bind this wave), ${W1}/build-sheet.md (your lane's exact file list, interfaces, tests, gates — deliver every item in your lane's section; its blocker resolutions D-W3-*, the ten head-resolved "design-services origin" functions in PART 7c — re-derive the list with the sheet's enumerator at branch time — and the pinned-hash re-pin rules are binding), ${BUILD}/waves/w1/wave-report.md and ${BUILD}/waves/w2/wave-report.md (what the earlier waves built), ${W1}/env.md (base sha, worktrees, mint numbers, stack ownership). Evidence for every codebase claim: ${ROOT}/research/04-codebase-today.md. The proposal: ${ROOT}/proposal.html.
SKILLS: load via the Skill tool before you start — backend: patina-db-migrations, patina-testing, patina-verification, patina-stripe-payments; edge: patina-edge-functions, patina-testing, patina-verification; designer/client/sub: patina-portal-features, patina-testing, patina-verification.
REPO RULES: work ONLY inside your assigned worktree; first command 'git -C <wt> rev-parse --show-toplevel' and paste it. Absolute paths; never chain 'cd' with '&&' (a bare 'cd <wt>' in its own Bash call before pnpm turbo / pnpm --filter). Commit with explicit pathspecs; NEVER 'git add -A' or 'git add .'; Conventional Commits subjects; no 'merge(...)' subjects; no trailers. Do NOT push. Do NOT run any production mutation (no 'supabase db push', no 'supabase functions deploy', no wrangler deploy). Do NOT touch .claude/, .agents/, hooks, settings, or any .env file. Do NOT use SendMessage. Do NOT create or remove worktrees. Do NOT reset or write to the shared local Supabase stack during the build; the backend lane validates on a SCRATCH database; only the integration steward resets the shared stack. Sandbox: retry with dangerouslyDisableSandbox: true on sandbox evidence — docker, git fetch/worktree add, pnpm install, playwright/chromium and the supabase CLI need it here. Docs are written with the Write/Edit tools, never Bash heredocs (a hook blocks them).
VOCABULARY AND REFUSALS (binding on every string a designer or homeowner reads): Agreement · Part · Library · Template · Addendum (R7); never "clause library", "contract builder", "variant", a database column name, or "AI" in UI text; homeowner copy never says "gate", "task", "dashboard" or "overdue"; no badges, no numeric count chips, no red/green status, no checkmark-as-status, no emoji, no confetti; paper register only — do not restyle the deployed desk or the Billing card. Prose never carries money (R5): only schedule parts project into terms/authority.
SCOPE: exactly the items in your lane's section of the build sheet — no unrequested features, refactors, or abstractions. Tests for every behavior you change. Program docs under ${BUILD}/ are gitignored by the repo's 'build/' rule — commit them with 'git add -f'. Write a lane log at ${W1}/<lane>-notes.md and force-add + commit it.
REPORT: FINAL action = the StructuredOutput tool call, even on failure. Evidence-grounded (command output, diff stats, pass/fail counts). 'advisories' never blocks you.
`

const STEWARD_BRIEF = `You are the Wave 3 steward; no product code.${STANDING}
1. 'git -C ${REPO} fetch origin main' (unsandboxed). Base = the descendant of local main / origin/main; expected ${BASE_HINT} or a descendant. Confirm Waves 1 and 2 are on it: 'git log --oneline -20 <base>' shows both integration merges, 'ls ${REPO}/supabase/migrations | tail -4' includes the agreement_parts, agreement_library and agreement_fee_schedules migrations, and 'grep -rln "agreement-library" ${REPO}/apps/designer-portal/src | head -2' finds the flag. If not, return ok=false.
2. Mint: highest 005NN on any ref ('git -C ${REPO} for-each-ref --format=%(refname)' then 'git ls-tree -r --name-only <ref> -- supabase/migrations | sort | tail -1' for every ref) plus one; expected ${MINT_HINT} (Wave 3 uses TWO consecutive numbers: mintFrom and mintFrom+1).
3. Worktrees on new branches from the base (unsandboxed): ${JSON.stringify(LANES.map(l => ({ wt: l.wt, branch: l.branch })))}.
4. Bootstrap every worktree: bare 'cd <wt>' then 'pnpm install --frozen-lockfile' (unsandboxed), then 'pnpm turbo build --filter=@patina/designer-portal^...' (designer), '--filter=@patina/client-portal^...' (client and sub), '--filter=@patina/supabase^...' (backend); the edge worktree needs only 'pnpm install' and 'deno --version'. Paste the tail of each.
5. Local stack: 'supabase status --workdir ${REPO}' (unsandboxed) — confirm the stack is up and record 'select version from supabase_migrations.schema_migrations order by version desc limit 3' from postgresql://postgres:postgres@127.0.0.1:54322/postgres. Do NOT reset. Write ${W1}/stack-notice.md stating this program (agreement-w3) now owns the local stack, that lanes use scratch DBs, and that the integration steward will reset.
6. Write ${W1}/env.md: base sha, worktrees + branches, mintFrom (and mintFrom+1), local URLs (designer 3000, client 3002, supabase 54321/54322), the flag override for all three flags 'agreement-parts', 'agreement-library', 'design-build' (check use-feature-flag.ts's parseFlagOverride for the separator it accepts and write the exact syntax), service-role key from 'supabase status -o env' (for the walk; label it local-only), scratch-DB recipe (createdb patina_w3; pg_dump postgres | psql -d patina_w3; apply new migrations with psql -v ON_ERROR_STOP=1; dropdb at the end), and stack ownership. git add -f + commit both docs on main is NOT allowed — write them to disk only (the integration steward commits program docs).
7. Return ok=true only when everything above succeeded.`

function implBrief(lane) {
  const common = `${STANDING}\nYOUR WORKTREE: ${lane.wt}   YOUR BRANCH: ${lane.branch}. Read ${W1}/env.md.\n`
  if (lane.key === 'backend') return `You are the BACKEND lane for Wave 3. Deliver EVERY item in the build sheet's backend lane section: TWO migrations (mintFrom = the design-build kind: CHECK widenings on proposals and project_commercial_documents, billing_cadence 'per_draw' on both rows, the patina.design_build seeded template, studio_license_attestations, agreement_jurisdiction_notices seeded WI/MN/IL/CA/NY/MA with enabled=false, draws/allowances/pricing_basis payload validation, issue_agreement_draw_invoice on the 00571 rail, and the three body-hash-pinned blockers resolved exactly as D-W3-3 states — _sign_design_services_agreement_authorized, guard_commercial_signature_insert, app_private.issue_invoice_for_actor — plus every one of the ten head-resolved "design-services origin" functions from PART 7c, re-derived with the sheet's enumerator; mintFrom+1 = trade agreements: studio_trade_agreements, _signatures, _tokens (shape of trade_rfq_tokens 00424), RPCs create/send/sign_by_token/void with token replay protection, RLS so a sub token reads only its own agreement, the seeded flow-down clause disabled), every redefined function grafted from its latest body (grep 'CREATE OR REPLACE FUNCTION[^(]*<name>' | sort | tail -1), every pinned hash re-pinned in the same change, SQL tests per the sheet (SQL-T11/RC-8 that try to falsify the "fingerprint needs no change" ruling included), seed/00-legacy-grants.sql regenerated if you added any GRANT/REVOKE, types regenerated from the scratch DB.${common}
SCRATCH DB (the shared stack is not yours): PGPASSWORD=postgres 'createdb -h 127.0.0.1 -p 54322 -U postgres patina_w3', 'pg_dump -h 127.0.0.1 -p 54322 -U postgres --no-owner --no-acl postgres | psql -h 127.0.0.1 -p 54322 -U postgres -d patina_w3' (unsandboxed), confirm 'select version from supabase_migrations.schema_migrations order by version desc limit 3' shows Wave 1's migration (if lower, apply the missing main migrations from your worktree first), apply your migrations in order with psql -v ON_ERROR_STOP=1 -f, run your SQL tests + the commercial/authority suites against postgresql://postgres:postgres@127.0.0.1:54322/patina_w3 (read scripts/run-sql-tests.sh for the variable it honors; run files directly with psql if it hard-codes the database), regenerate types from the scratch DB ('supabase gen types typescript --db-url postgresql://postgres:postgres@127.0.0.1:54322/patina_w3 > packages/supabase/src/database.types.ts'), drop the scratch DB at the end.
GATES TO PASTE: scratch-DB apply clean; every SQL test you ran with pass counts; 'pnpm --filter @patina/supabase type-check'; 'pnpm --filter @patina/types type-check'; types diff stat. Commit per item (feat(agreements): …).`
  if (lane.key === 'designer') return `You are the DESIGNER PORTAL lane for Wave 3. Deliver EVERY item in the build sheet's designer lane section: the packages/types and packages/supabase hook additions the sheet assigns to you (I-1 COMMERCIAL_DOCUMENT_KINDS on day one, then rebuild the @patina/types dist), the rooms/drafting/agreement/turnkey/ folder (pricing basis editor with schedule of values, draws with retainage, allowances, sub disclosure clause, the supervision-vs-markup no-double-count validation with its copy, lien-waiver attachments per draw), the licensing gate sheet (M7) and the Licensing card in account-studio-page.tsx (one insertion, Billing untouched), the Trade Agreement composer + send + status, and the design-build template selectable only when an attestation is on file. With 'design-build' off, Wave 2's room renders unchanged — prove with a snapshot test. Code against the backend lane's INTERFACES per the sheet — the backend is building concurrently; stub only in tests.${common}
GATES TO PASTE: bare 'cd ${lane.wt}' then 'pnpm --filter @patina/designer-portal type-check', 'pnpm --filter @patina/designer-portal lint', 'pnpm --filter @patina/designer-portal test -- <touched test files>' AND the full 'pnpm --filter @patina/designer-portal test' once at the end (paste suite/test counts). Commit per item (feat(document): …).`
  if (lane.key === 'client') return `You are the CLIENT PORTAL lane for Wave 3. Deliver EVERY item in the build sheet's client lane section: the sign route learns 'design_build' explicitly in its routing (the sheet's fail-open finding: the allowlist auto-admits the kind from @patina/types while the furnishings → trade_scope → else routing does not — add the branch and a test that asserts WHICH RPC ran), commercial-document-shell renders the design-build body (schedule of values, draws, attachments as leaves), consent-copy learns the kind, door-gate + the new DepositOffer (after the signature commits, a separate failable call mints the deposit link to the shipped /pay/[token] surface; a failure never touches the signature), jest with the coverage floor, and the e2e touchpoint the sheet names.${common}
GATES TO PASTE: bare 'cd ${lane.wt}' then 'pnpm --filter @patina/client-portal type-check', 'pnpm --filter @patina/client-portal test' (coverage floor). Commit per item (feat(client): …).`
  if (lane.key === 'edge') return `You are the EDGE FUNCTIONS lane for Wave 3. Deliver EVERY item in the build sheet's edge lane section: proposal-send and all four commercial-document-notify modules learn 'design_build'; the new trade-agreement-send function (token email to the sub, cloned from trade-rfq-send's shape) and the new _shared/trade-agreement-emails.ts (a NEW file — edit no existing _shared file, so the redeploy set stays exactly three functions); config.toml entries; Deno tests for every branch. No deno.lock left at the repo root.${common}
GATES TO PASTE: 'deno test --allow-all --config ${lane.wt}/supabase/functions/deno.json ${lane.wt}/supabase/functions/_shared/' and each touched function dir; 'deno check' on each touched index.ts. Commit per item (feat(edge): …).`
  return `You are the SUB SIGNING lane for Wave 3. Deliver EVERY item in the build sheet's sub lane section: the /trade/[token] tree in the client portal cloned file-for-file from the proven /rfq/[token] pattern (no login; the token resolves exactly one agreement; expired or used tokens show the sheet's copy), the two public-prefix registrations (middleware.ts, app-chrome.tsx), the typed-name + press-and-hold signature act writing through sign_trade_agreement_by_token, the studio-only bid ledger never rendered (R13), jest with the coverage floor, and the e2e touchpoint the sheet names.${common}
GATES TO PASTE: bare 'cd ${lane.wt}' then 'pnpm --filter @patina/client-portal type-check', 'pnpm --filter @patina/client-portal test' (coverage floor). Commit per item (feat(client): …).`
}

function gatesFor(lane) {
  if (lane.kind === 'designer') return "bare 'cd " + lane.wt + "' then 'pnpm --filter @patina/designer-portal type-check', 'lint', and the full 'test'. Diff the flag-off snapshot against main's markup yourself."
  if (lane.kind === 'client' || lane.kind === 'sub') return "bare 'cd " + lane.wt + "' then 'pnpm --filter @patina/client-portal type-check' and 'test' (coverage floor). For the sign route: a test proves a design_build document dispatches to the design-build RPC, never to the plain design-services one. For /trade/[token]: a used or expired token cannot sign twice; the bid ledger is absent from the DOM."
  if (lane.kind === 'edge') return "'deno test --allow-all --config " + lane.wt + "/supabase/functions/deno.json " + lane.wt + "/supabase/functions/_shared/' plus proposal-send, commercial-document-notify and trade-agreement-send dirs; 'deno check' on each touched index.ts; confirm no existing _shared file changed ('git -C " + lane.wt + " diff --stat main...HEAD -- supabase/functions/_shared')."
  return "rebuild the scratch DB per env.md (createdb patina_w3r; pg_dump | psql; apply the lane's two migrations in order with psql -v ON_ERROR_STOP=1), run the lane's SQL tests, the commercial suites and public_sd_hardening_contract_test.sql against it, then probe: a seeded template cannot be updated or deleted by any role without the maintenance GUC; a studio member who is not admin/owner cannot write studio_agreement_parts or agreement_templates but can read them; materialize_agreement_template strips owner refs and lands parts in order; save_agreement_as_template from a sent proposal snapshots without mutating it; compose_agreement_consent for the nine standard parts, for flat, for per_phase, and for zero money parts (must equal today's literal); countersign under a flat and a per_phase agreement snapshots fee_basis/fee_amount_cents/fee_schedule/retainer_credit_rule on project_billing_authorities; the execution snapshot's document_hash equals _commercial_document_fingerprint at execution; the old-arity sign/countersign functions no longer exist (\\df) and grants are re-issued on the new arity; no function in the diff calls app_private.issue_invoice_for_actor; both pinned hashes in the contract test match. dropdb at the end. 'pnpm --filter @patina/supabase type-check'."
}

function reviewBrief(lane, round, prior) {
  return `You are the ADVERSARIAL REVIEWER for the Wave 3 ${lane.key} lane (round ${round + 1}). You did not write this code. Find what is wrong, missing, off-brief, off-contract, or off-vision, and prove it. Report EVERY finding with severity and confidence — never filter; the orchestrator filters.${STANDING}
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
  return `You are the FIX agent for the Wave 3 ${lane.key} lane (round ${round + 1}). Fix every blocker and major below in ${lane.wt} (branch ${lane.branch}); minors only when trivial. Check 'git -C ${lane.wt} status --short' first.${STANDING}
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
  return `You are the INTEGRATION steward for Wave 3. Merge the lanes, reconcile migrations, run every gate, prepare the walk. No product code except conflict resolution and renumbering.${STANDING}
LANE STATE (merge shipped lanes; majors ride as advisories; an open BLOCKER merges only if documented as accepted in ${W1}/<lane>-notes.md):
${JSON.stringify(summary, null, 1)}
STEPS: (1) fetch origin main (unsandboxed); tip = descendant; 'git -C ${REPO} worktree add ${WT}/agent-agr-w3-integration -b agreement/w3-integration <tip>'. (2) Merge --no-ff, subjects 'chore(agreements): merge w3-<lane>', order backend → edge → designer → client → sub; resolve minimally; list. (3) Migrations: re-check the tip's highest number; renumber OUR two files upward on collision, keeping them consecutive (filenames + banners + the lineage line in the second); never touch main's. (4) Bootstrap (bare cd; pnpm install --frozen-lockfile unsandboxed; turbo build designer-portal^... and client-portal^...). (5) GATES, paste all: append to ${W1}/stack-notice.md then 'supabase db reset' (unsandboxed, this steward owns the stack now) + scripts/run-sql-tests.sh (or the direct psql equivalent) incl. the new agreement tests and public_sd_hardening_contract_test.sql; 'pnpm db:generate' then 'git diff --exit-code packages/supabase/src/database.types.ts' (must be clean; if not, the lane forgot to regenerate — regenerate and commit); @patina/supabase type-check + test; @patina/types type-check; designer-portal type-check + lint + FULL jest (paste suite/test counts); client-portal type-check + test; admin-portal build (UNSANDBOXED — sandboxed produces a silent empty build; delete apps/admin-portal/.next/types first if type-check complains); deno: 'deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/' plus proposal-send, commercial-document-notify and trade-agreement-send dirs, and 'deno check' on each of their index.ts; confirm no pre-existing _shared file changed; no deno.lock left. (6) Client e2e '--workers=1' with SUPABASE_SERVICE_ROLE_KEY exported from 'supabase status -o env' and the two-flag override from env.md (plans-link.spec / share-link.spec are pre-existing failures on main; everything else must pass) — paste the summary. (7) Deploy set over tip...HEAD (migrations above the tip's highest — two; edge functions = proposal-send, commercial-document-notify, trade-agreement-send plus any transitive importer of a changed pre-existing _shared file — expected none; portals designer + client; note whether any function needs --no-verify-jwt — expected none). (8) ${W1}/walk-env.md: boot recipe for designer (3000) and client (3002) from the integration worktree with the two-flag override, the seeded accounts (from ${REPO}/docs and prior programs' walk docs — tester@patina.cloud/000000 is the test-login precedent), service-role key (local-only). (9) ${W1}/wave-report.md — git add -f + commit.
Return ok=true only when every gate in 5–6 is green (excluding the two named pre-existing e2e failures).`
}

function webWalkBrief(integ, round, prior) {
  return `You are the WEB WALKER for Wave 3 (round ${round + 1}). Boot BOTH portals from ${integ.worktree} (see ${W1}/walk-env.md) against the LOCAL stack (do NOT reset) with the two-flag override from walk-env.md (agreement-parts and agreement-library both on), and walk in a real browser. No product code.${STANDING}
Boot with nohup (unsandboxed) so the servers survive your turn; wait for 127.0.0.1:3000 and :3002; kill what you started at the end and say so. Playwright headless chromium or the Chrome MCP tools; throwaway scripts under ${W1}/web-walk/; screenshots into ${W1}/web-walk-shots-r${round + 1}/ at 1280 and 390.
${prior ? 'PRIOR ROUND FINDINGS (re-verify):\n' + JSON.stringify(prior.findings, null, 1) : ''}
WALK: follow the 16-step walk script in ${W1}/build-sheet.md §8 exactly using the Halvorsen fixture figures from ${ROOT}/source/fixtures.json, proving each step with a screenshot and a SELECT where the sheet names one (attestation row; the design-build template unselectable before it and selectable after; draws summing to the GMP with retainage held per draw; the client's signature dispatched to the design-build RPC — assert which RPC ran, not the HTTP status; the deposit offer appearing AFTER the signature row exists and its failure leaving the signature intact; countersign with cadence per_draw on the authority; draw 1 invoice on the 00571 rail with a pay link; the Trade Agreement sent to Cabinetry; the sub's token page signing once and refusing twice; the bid ledger absent from the sub's DOM; a lien waiver attached to draw 2; notices present in the table with enabled=false and absent from every rendered page). Then: (a) FLAG-OFF walk — with design-build off, Wave 2's room and door render with identical markup. (b) Account → Studio: Licensing card saves and re-reads; Billing and Library cards unchanged. (c) Vocabulary grep of rendered text on both portals and the sub page (variant, column names, gate/task/overdue, "AI"; the disclaimer sentence verbatim, never a word count). (d) axe on the turnkey room, the door and /trade/[token] — report violations.
Report every defect with screenshot paths; verdict 'ship' when no blocker and no major. Write ${W1}/walk-web-r${round + 1}.md (git add -f + commit on the integration branch).`
}

function walkFixBrief(integ, findings, round) {
  return `You are the WALK-FIX agent for Wave 3 (round ${round + 1}). Fix every blocker and major below directly in ${integ.worktree} (branch ${integ.branch}); commit with pathspecs; re-run the gates for what you touched (designer-portal type-check + touched tests if apps/designer-portal; client-portal type-check + test if apps/client-portal; SQL tests on a scratch DB if migrations — do NOT reset the shared stack mid-walk; @patina/supabase type-check if packages). Append to ${W1}/wave-report.md under "Walk fixes" (git add -f).${STANDING}
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
  const t0 = await agent(`You are the T0 TYPES agent for Wave 3 (the types-first handshake). Product code limited to packages/types.${STANDING}
IN ${LANES[0].wt} (branch ${LANES[0].branch}): apply ONLY the packages/types additions the Wave 3 build sheet lists (${W1}/build-sheet.md §2 lane ownership and "Cross-lane interfaces" — template/library DTOs, fee-schedule and consent types, snapshot and part-event types); Wave 1's agreement.ts already exists — extend it, never rewrite it; keep every existing export byte-identical. If the sheet lists no packages/types change, make no commit, run the type-check in all three worktrees, and return shipped=true with headSha = the current backend head. bare 'cd ${LANES[0].wt}' then 'pnpm --filter @patina/types type-check' and 'pnpm turbo build --filter=@patina/types' — paste both. Commit ONLY those files: 'feat(types): agreement parts vocabulary and payloads (T0)'. Then cherry-pick that commit onto every other lane branch: ${LANES.slice(1).map(l => "'git -C " + l.wt + " cherry-pick <sha>'").join(', ')} (unsandboxed if needed), and in each portal worktree (designer, client, sub) run bare 'cd <wt>' then 'pnpm turbo build --filter=@patina/types' — paste tails. Return StructuredOutput: headSha = the T0 commit sha on the backend branch; shipped=true only when all five worktrees carry it and the types dist is built in the three portal worktrees.`, { label: 'T0 types', phase: 'Steward', schema: LANE_SCHEMA, model: 'sonnet' })
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
