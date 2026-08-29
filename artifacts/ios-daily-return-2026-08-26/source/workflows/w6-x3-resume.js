export const meta = {
  name: 'daily-return-w6-x3-resume',
  description: 'W6 completion: resume lane X3 (session isolation) from its uncommitted worktree, add the root-level foreground refresh, review, merge into the integration branch, gate, walk the isolation items',
  phases: [
    { title: 'X3 resume', detail: 'finish the uncommitted SessionScope work in agent-dr-w6-x3; the foreground refresh at the app root' },
    { title: 'Review', detail: 'separate-context review' },
    { title: 'Integrate', detail: 'merge x3 → daily-return/integration; gates; signed .app' },
    { title: 'Walk', detail: 'sign-out/sign-in isolation, the Ask thread, the foreground reload from another tab' },
  ],
}
const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const S = `${OUT}/source`
const R = `${OUT}/research`
const W = `${OUT}/waves/w6`
const APP = `${ROOT}/apps/mobile/Patina`
const WT = `${ROOT}/.codex/worktrees/agent-dr-w6-x3`
const INT_WT = `${ROOT}/.codex/worktrees/agent-dr-w6-integration`
const REVIEW_UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'
const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app. Program folder ${OUT}; read ${S}/build-plan.md "Global constraints" (incl. the screen-capture rule: simctl/blitz screenshots only, never desktop capture) and "### W5 — DONE" (the carry-over that is X3's brief); ${W}/steward.md; ${W}/integration.md (what X1/X2 landed; §"DELIBERATELY NOT APPLIED" item (a) — the foreground refresh only fires on Today). Sandbox: xcodebuild, xcrun simctl, git worktree/merge, osascript, docker, sips need dangerouslyDisableSandbox: true; builds in the foreground; run the gate script from the worktree's own copy; a first xcodebuild may fail on GitCommit.swift — run twice. Pathspec commits only; never push; never git in the main checkout except read-only. Honesty (C5); SP-06; both roots must render. FINAL action = StructuredOutput even on failure.`
const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const REPORT = { type: 'object', required: ['ok', 'notes'], properties: { ok: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, app_path: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }
const REV = { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } } } }

phase('X3 resume')
const x3 = await safe('X3r', agent(`${COMMON}

ROLE: X3 (resumed) — session isolation. The previous X3 agent died on a server error mid-lane: its worktree ${WT} (branch daily-return/w6-x3 at main 4b35e0a94, ZERO commits) holds UNCOMMITTED work — 8 modified + 3 new files (SessionScope.swift, SessionIsolationTests.swift, DesignerProjectRuleTests.swift, edits to AuthService, BadgeCountService, DesignRequestStatusService, OrdersService, StudioHubViewModel, SettingsSe…) — and a STALE lock (owner proven dead: no commits, no process). Unsandboxed: cd ${WT}; rmdir .writer.lock.d; mkdir .writer.lock.d; git status --porcelain; git diff --stat. READ every changed and new file before deciding anything; the prior agent's task list may exist at ${W}/x3-tasks.md — read it if so. Then, per the W5 carry-over brief (build-plan.md §W5-DONE): (1) one SessionScope reset on the auth-state change seam AuthService owns: every process-lifetime singleton caching account data (BadgeCountService rows + counts, DesignRequestStatusService requests/liveLead, OrdersService, RoomSyncCoordinator's debounce, DesignerThreadOpener's inputs, RecordSnapshotStore's in-memory record, StudioHubViewModel's snapshot) is cleared BEFORE the new account's first fetch and refetched after; enumerate by grep (static let shared … @Observable) and pin the list with a SourcePin; (2) the project rule: DesignerRelationshipResolver.activeProject(in:) and DesignerThreadOpener pick the project carrying the most urgent NEEDS YOU item (HouseRecord.needsYou's first row's project), else the most recently updated active project; (3) NEW, from integration.md item (a): the foreground refresh fires from the APP ROOT — move (or duplicate) the scenePhase → .active trigger of RecordRefresh.run out of DailyRoomView into the root (PatinaApp / ContentView), so a foreground from Studio/Spaces/Pieces rebuilds the record and reloads the widget timeline too; keep DailyRoomView's own on-appear behaviour; test with a SourcePin + a unit test that the root hook calls the same entry point. Finish the uncommitted work coherently (keep what is right, rewrite what is not — say which), tests real. Create + boot a fresh iPhone 17 Pro / iOS 26.5 device "dr-w6-x3r" (never ${REVIEW_UDID}); -derivedDataPath ${WT}/.build/dd. GATE (unsandboxed, foreground): the worktree's ios-gate.sh build; xcodebuild test -only-testing:PatinaTests on dr-w6-x3r — whole tier green; signed .app → app_path. SIM CHECK on your device: sign in client@patina.dev → Settings → Sign Out → sign in james.okafor@example.com → the Studio hub, Today and the Companion show James's data (no client@ project names anywhere — scan_ui) → Ask Leah to source this on a piece → the thread is James's (psql: comms_threads created_by = James's uid) with no error sheet; background the app from the Studio tab and foreground it → the record rebuilt (widget-snapshot.json's refreshedAt advanced). Shots ${OUT}/shots/w6-x3-NN-*.png; ledger rows under "## w6-x3". Conventional Commits with pathspecs (one per item); rmdir the lock; delete the device. Return ok, commits, gate, app_path, notes (what of the prior agent's work was kept/rewritten), failures.`, { label: 'X3 resume', phase: 'X3 resume', model: 'opus', effort: 'high', schema: REPORT }))
if (!x3 || !x3.ok) return { x3 }

phase('Review')
const rev = await safe('V', agent(`${COMMON}

ROLE: reviewer of X3, separate context, read-only (git -C ${WT} diff main...HEAD; log; ${W}/x3-tasks.md if present; report ${JSON.stringify({ commits: x3.commits, gate: x3.gate, notes: x3.notes })}). Check: the reset covers EVERY account-caching singleton (grep yourself and compare with the SourcePin's list); ordering (clear before the new account's first fetch; no window where B's screens read A's rows); the project rule matches W4's seat rule; the root-level foreground hook calls the same RecordRefresh entry and does not double-run on Today; no unrelated change; tests real and failing-without-the-change; pathspec Conventional Commits. Write ${W}/x3-review.md; every finding with severity + confidence.`, { label: 'X3 review', phase: 'Review', model: 'opus', effort: 'high', schema: REV }))
let fix = null
if (rev && (rev.blocking.length || rev.major.length)) {
  fix = await safe('X3 fix', agent(`${COMMON}

ROLE: X3 fix round in ${WT} (lock discipline; a fresh "dr-w6-x3f" device). Read ${W}/x3-review.md; address every blocking and major (change or rebut in ${W}/x3-fix-log.md with evidence); re-run the gate; signed .app; pathspec commits; delete the device. Findings: ${JSON.stringify({ blocking: rev.blocking, major: rev.major })}`, { label: 'X3 fix', phase: 'Review', model: 'opus', effort: 'high', schema: REPORT }))
  if (!fix || !fix.ok) return { x3, rev, fix }
}

phase('Integrate')
const integ = await safe('integrate', agent(`${COMMON}

ROLE: steward — complete W6's integration in ${INT_WT} (daily-return/integration @ ef6020494; verify toplevel; mkdir .writer.lock.d). Unsandboxed: git merge --no-ff daily-return/w6-x3 -m "chore(daily-return): integrate w6 lane x3" (resolve by intent if needed — X3 touches AuthService/BadgeCountService/OrdersService/StudioHubViewModel; X2 touched RecordSnapshotStore/FeatureFlags/Invoices — overlap is unlikely but check). Then the full gate: the worktree's ios-gate.sh build; the whole PatinaTests tier on dr-w6-int (89112219-9338-48C1-87CA-99540AAA7489 — boot it if needed); the widget target builds and the .appex is embedded; the worktree's ios-gate.sh lint-delta main; signed .app → app_path; flag on and off both launch. Append "§9 — completion" to ${W}/integration.md. Return ok only if every gate is green.`, { label: 'integrate x3', phase: 'Integrate', model: 'opus', effort: 'high', schema: REPORT }))
if (!integ || !integ.ok) return { x3, rev, fix, integ }

phase('Walk')
const walk = await safe('walk', agent(`${COMMON}

ROLE: walker — the W6 isolation items on ${REVIEW_UDID}, blitz gestures only (ToolSearch the mcp__blitz-iphone__ tools; explicit udid), simctl screenshots only. Read ${W}/walk.md (your last pass — keep its verdicts; you are adding the X3 items) and ${W}/x3-review.md. Unsandboxed: xcrun simctl install ${REVIEW_UDID} ${integ.app_path}; launch -DeploymentTarget local. Script: signed in as client@patina.dev → Settings → Sign Out → sign in james.okafor@example.com (password123) → Today/Studio/Companion carry James's data only (scan_ui: no "Aspen Loft", "Birch Hollow", "Marrow" strings) → Ask Leah to source this → lands in James's thread, no error (psql confirms) → Settings → Sign Out → sign in client@patina.dev → the Ask thread from a piece lands on the project carrying the open NEEDS YOU items (Aspen Loft Refresh); from the Studio tab, background (home button via blitz or xcrun simctl launch of another app, then relaunch the app) → widget-snapshot.json's refreshedAt advanced. If gestures die, use xcrun simctl openurl for route checks and mark the tap-only items BLOCKED-HARNESS. Append the results to ${W}/walk.md (a "## walk 2 — X3" section), ledger rows under "## w6 walk 2", shots w6-NN continuing. Leave the simulator signed in as client@patina.dev, flags off, on the Daily Room. NO git writes. Return ok = no FAIL.`, { label: 'walk x3', phase: 'Walk', model: 'sonnet', schema: REPORT }))
return { x3: { ok: x3.ok, commits: x3.commits, gate: x3.gate, notes: x3.notes }, rev, fix: fix && { ok: fix.ok, commits: fix.commits }, integ: { ok: integ.ok, gate: integ.gate, app_path: integ.app_path, notes: integ.notes }, walk }
