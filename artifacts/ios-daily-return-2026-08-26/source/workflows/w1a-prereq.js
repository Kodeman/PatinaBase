export const meta = {
  name: 'daily-return-w1a-prereq',
  description: 'W1a of the Daily Return build: the sequential prerequisites every later lane depends on — gate hygiene, FeatureFlags, SP-07, DesignerRelationship, thread creation, one attention count — implemented in one worktree, reviewed, fixed',
  phases: [
    { title: 'Implement', detail: 'one Opus implementer, task list first, six items, gate green' },
    { title: 'Review', detail: 'separate-context adversarial review' },
    { title: 'Fix', detail: 'blocking + major addressed in the same worktree; gate re-run' },
  ],
}

const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const S = `${OUT}/source`
const R = `${OUT}/research`
const W = `${OUT}/waves/w1a`
const APP = `${ROOT}/apps/mobile/Patina`
const WT = `${ROOT}/.codex/worktrees/agent-dr-w1a-prereq`
const BRANCH = 'daily-return/w1a-prereq'
const REVIEW_UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'

const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app (apps/mobile/Patina). The orchestrator (Fable) reads only your structured return and your files on disk.
Ground rules:
- Program folder: ${OUT}. Read ${S}/build-plan.md "Global constraints" and "### W1a" IN FULL first; then ${S}/rulings-2026-08-27.md; then the spec sections the W1a items cite (${S}/shared-planks.md §SP-07, §SP-13, §SP-16; ${S}/direction-a.md §5 "Attribution"; ${S}/direction-b.md §5 first paragraph; ${S}/build-plan-critique.md B1, B8, B10, M15, M20 for the verified facts). Load Skill "patina-ios-verification" and Skill "patina-parallel-work".
- Sandbox: xcodebuild, xcrun simctl, git worktree add/remove, git merge, osascript, docker and the supabase CLI fail inside the command sandbox — run exactly those with dangerouslyDisableSandbox: true; everything else sandboxed. Every build/test runs in the foreground.
- Never git add -A / git add . ; pathspec commits only; never push; never run git in the main checkout except read-only log/show; never touch production.
- Report with evidence (command output, diff stats, test names + pass/fail, shot names) — never a paraphrase. FINAL action = StructuredOutput, even on failure.`

const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const IMPL = { type: 'object', required: ['ok', 'commits', 'gate', 'notes'], properties: { ok: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, gate: { type: 'string', description: 'build/unit/lint-delta results with counts' }, tasks_file: { type: 'string' }, app_path: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }
const REV = { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } }, praise: { type: 'array', items: { type: 'string' } } } }

phase('Implement')
const impl = await safe('I1', agent(`${COMMON}

ROLE: I1 — implementer of W1a (the whole lane, in order). Deliver exactly the six W1a items in build-plan.md; no unrequested features, refactors or abstractions.
WORKSPACE (mandatory, first). A previous attempt at this lane died on a network error before making any commit, so the workspace ALREADY EXISTS — reuse it, do not recreate it: the worktree ${WT} is checked out on branch ${BRANCH} at main (dc5722b0b) with zero commits; ${WT}/.writer.lock.d is a STALE lock whose owner is proven dead (orchestrator verified: no commits, no xcodebuild running) — rmdir it and mkdir it again as yours; Secrets.swift is already copied in (gitignored; never commit). Verify: cd ${WT} && git rev-parse --show-toplevel ends with agent-dr-w1a-prereq && git log --oneline main..HEAD is empty && git status --porcelain shows nothing staged. If the worktree were missing you would create it unsandboxed with git -C ${ROOT} worktree add ${WT} -b ${BRANCH} main — but it is not missing. Simulator: the clone "dr-w1a" already exists and is booted — UDID 66973A52-06CB-4455-8EC1-4C8A75496FA8; use ONLY that clone for tests and sim checks (never ${REVIEW_UDID}, and ignore the Coach-* devices, which belong to another session). DerivedData: pass -derivedDataPath ${WT}/.build/dd to every xcodebuild.
TASK LIST FIRST: write ${W}/prereq-tasks.md (create the dir) in the superpowers writing-plans format — one task per W1a item, each with: files (exact paths), interfaces (exact Swift signatures the plan names — FeatureFlags.Flag, FeatureFlags.shared.isOn(_:), resolveAtLaunch(), DesignerRelationship cases + isLive, DesignerRelationshipResolver.resolve(promotedRequest:projects:roster:), MessagingAPIClient.createThread(projectId:) / createDirectThread(counterpart:), BadgeCountService.attentionCount + retained rows), the failing test (real Swift Testing code), the run command, the implementation, the pass run, the pathspec commit message. Read the code you will touch before writing it (Serena symbolic tools scoped to apps/mobile/Patina, or grep + Read). Then execute the tasks in order, committing after each.
The six items (details in build-plan.md §W1a — follow it):
1. Gate hygiene — ScanBucketMimeTests maps the three keyframe kinds; the unit tier runs to completion.
2. FeatureFlags — Core/State/FeatureFlags.swift; resolved once in PatinaApp before the root is chosen; DEBUG launch-arg override -PatinaFlags a,b (comma list of raw values) → PostHog after onFeatureFlags with a bounded 1.5 s wait → false; held for the session; --uitesting keeps flags off unless the launch arg names them. Read Services/Analytics/PostHogService.swift:149 area and PatinaApp.swift:25-27 first. Tests for override / PostHog fallback / timeout / held value.
3. SP-07 — DesignRequestStatusService.fetchLeadRows() drops the client_request_id=not.is.null filter (keep the client scope); the matched branch at TodayExperience.swift:80-91 becomes reachable for a portal-created lead; "Get design help" at engaged/activeProject opens the existing request status instead of filing a second lead (find every entry point via CompanionActionRows / DesignServices). Tests in EngagementTierTests (+ a duplicate-lead guard). Keep the seed accounts' behaviour in mind: james.okafor@example.com's lead has no client_request_id.
4. DesignerRelationship — Core/State/DesignerRelationship.swift + DesignerRelationshipResolver; roster from designer_clients (00014:72-90) — add the smallest read (a PostgREST select on designer_clients scoped by RLS to the client) in the existing client that fits (ProjectsAPIClient or a new RosterAPIClient in Core/Network); most-recent roster row wins, same-day tie → .none for attribution purposes (document in a comment: constraint the code cannot show). Tests per case.
5. SP-13 client half — MessagingAPIClient.createThread(projectId:) over rpc_start_project_thread(p_project_id) (supabase/migrations/00103_comms_rpcs.sql:113) and createDirectThread(counterpart:) over rpc_start_direct_thread (00103:51); "Message your designer" on ProjectDetailView; the Studio hub Conversation block gets a chevron + a compose path that creates the thread when none exists; a Companion row on the Daily Room when DesignerRelationship.isLive (CompanionAreaBuilders). Tests: RPC names pinned; affordance hidden with no designer.
6. One attention count — BadgeCountService.attentionCount as the single source for the Profile/Studio subhead + footer, the Daily Room footer and the Companion; BadgeCountService retains the fetched rows (pendingDecisions, payableInvoices, pendingProposals, threadSummaries, projects) as published properties for W2. Tests: equality across consumers; rows retained.
GATE (foreground, unsandboxed): apps/mobile/Patina/scripts/ios-gate.sh build ; then xcodebuild test -project ${WT}/apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug -destination 'platform=iOS Simulator,id=<clone udid>' -derivedDataPath ${WT}/.build/dd -only-testing:PatinaTests (the WHOLE unit tier must pass — item 1 makes that possible); then apps/mobile/Patina/scripts/ios-gate.sh lint-delta main (this lane is alone, so lint-delta is allowed). Paste the tails. Then build a properly signed simulator app for the walker (no CODE_SIGNING_ALLOWED=NO): xcodebuild build -destination 'platform=iOS Simulator,id=<clone udid>' -derivedDataPath ${WT}/.build/dd and record the .app path.
SIM CHECK on your clone (unsandboxed; launch with -DeploymentTarget local and -PatinaFlags house-first for one launch to prove the override): sign in as james.okafor@example.com (password123, per ${R}/02-steward-boot.md §7 — password path; dismiss the Save Password sheet) → Today shows the matched branch; tap "Get design help" → no new lead is created (check local Postgres: select count(*) from leads where client_id = <james profile id> before/after); capture ${OUT}/shots/w1a-01-james-matched-today.png, w1a-02-get-design-help-existing.png; sign in as client@patina.dev → Profile/Studio subhead, footer and Companion show the same count (w1a-03/04/05); Project detail shows "Message your designer" (w1a-06). Append rows to ${R}/01-shot-ledger.md under "## w1a".
FINISH: rmdir .writer.lock.d; git log --oneline main..HEAD; git status --porcelain must be empty. Return ok, commits (sha + subject), gate summary, tasks_file, app_path, notes (clone udid, sim-check results, anything you had to deviate from and why), failures.`, { label: 'I1 implement W1a', phase: 'Implement', model: 'opus', effort: 'high', schema: IMPL }))
log(`I1: ${impl ? `${impl.ok} · ${(impl.commits || []).length} commits` : 'NULL'}`)
if (!impl || !impl.ok) return { impl }

phase('Review')
const rev = await safe('V1', agent(`${COMMON}

ROLE: V1 — adversarial reviewer of W1a, separate context from the implementer. Read-only: git -C ${WT} diff main...HEAD, git -C ${WT} log --oneline main..HEAD, the task list ${W}/prereq-tasks.md, and the implementer's report: ${JSON.stringify({ commits: impl.commits, gate: impl.gate, notes: impl.notes })}. Do not build, do not commit.
Check every W1a item against build-plan.md §W1a and its cited spec: (1) is each named interface present with the exact signature; (2) FeatureFlags — is the value truly resolved once and held (no re-read on flag change), is the override DEBUG-only, is the PostHog wait bounded, does --uitesting behaviour match the plan, is the root chosen after resolution; (3) SP-07 — is the filter gone without widening scope beyond the client's own leads; does the matched branch render for a lead with no client_request_id; is every "Get design help" entry point at engaged/activeProject routed away from filing a lead; (4) DesignerRelationship — cases, isLive, roster read scoped by RLS, tie rule; (5) SP-13 — correct RPC names and parameter names (00103:51 and :113), idempotent thread creation, affordance gating; (6) count unification — one source, consumers actually switched (grep for the old per-surface computations), rows retained without breaking existing consumers; (7) tests — are they real, do they fail without the change (reason from the diff), do the existing suites named in the plan still pass per the gate output; (8) any unrelated change in the diff; Conventional Commits with pathspecs; brand voice in any copy; nothing rendered that lies (C5). Write ${W}/review.md. Report every finding with severity + confidence; do not filter.`, { label: 'V1 review W1a', phase: 'Review', model: 'opus', effort: 'high', schema: REV }))
log(`V1: ${rev ? `${rev.blocking.length}/${rev.major.length}/${rev.minor.length}` : 'NULL'}`)

phase('Fix')
let fix = null
if (rev && (rev.blocking.length || rev.major.length)) {
  fix = await safe('F1', agent(`${COMMON}

ROLE: F1 — fix round for W1a in the existing worktree ${WT} (branch ${BRANCH}; verify git rev-parse --show-toplevel; mkdir .writer.lock.d — if it exists, stop and report, another writer is active). Read ${W}/review.md and the implementer's task list. Address EVERY blocking and major item (change the code, or rebut in ${W}/fix-log.md with evidence); take cheap minors. Re-run the gate exactly as the implementer did (build; the whole PatinaTests tier on the "dr-w1a" clone — find its udid via xcrun simctl list devices | grep dr-w1a; lint-delta main), paste the tails, rebuild the signed .app, pathspec-commit each fix with a Conventional Commit, rmdir the lock. Review findings: blocking=${JSON.stringify(rev.blocking)} major=${JSON.stringify(rev.major)} minor=${JSON.stringify(rev.minor)}`, { label: 'F1 fix W1a', phase: 'Fix', model: 'opus', effort: 'high', schema: IMPL }))
  log(`F1: ${fix ? fix.ok : 'NULL'}`)
} else {
  log('No blocking/major findings — no fix round')
}

return { impl: { ok: impl.ok, commits: impl.commits, gate: impl.gate, tasks_file: impl.tasks_file, app_path: impl.app_path, notes: impl.notes, failures: impl.failures }, review: rev, fix: fix && { ok: fix.ok, commits: fix.commits, gate: fix.gate, notes: fix.notes, failures: fix.failures } }
