export const meta = {
  name: 'daily-return-w3-fix',
  description: 'W3 fix round on the integration branch per waves/w3/rulings-fable.md: the tour hoisted above the stacks and anchored on the bar, AppRoute.studio and a reachable profile/settings door, footers sized to the bar, the tour rewritten on both roots, auto-start gated to the Today tab — then review and a flag-on re-walk',
  phases: [
    { title: 'Fix', detail: 'one Opus lane on daily-return/integration (Navigation + Help + Money + Home files)' },
    { title: 'Review', detail: 'separate-context review' },
    { title: 'Re-walk', detail: 'flag-on acceptance items + flag-off parity' },
  ],
}
const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const S = `${OUT}/source`
const R = `${OUT}/research`
const W = `${OUT}/waves/w3`
const APP = `${ROOT}/apps/mobile/Patina`
const WT = `${ROOT}/.codex/worktrees/agent-dr-w3-integration`
const INT_UDID = 'A71FDDF2-D0F6-442F-9E21-B77604013F02'
const REVIEW_UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'
const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app. Program folder ${OUT}; read ${S}/build-plan.md "Global constraints"; ${W}/rulings-fable.md (YOUR BRIEF — rulings 1, 2, 3, 4, 6, 7 are the work); ${W}/integration.md §6–§7; ${W}/n1-notes.md §3–§4, ${W}/n3-notes.md §2, ${W}/n3-fix-log.md (the exact revert for ruling 4); ${W}/steward.md (the route→tab table, the inventory). Sandbox: xcodebuild, xcrun simctl, git worktree/merge, osascript, docker, sips need dangerouslyDisableSandbox: true; builds in the foreground; the shared DerivedData makes ios-gate.sh build flaky — re-run on a failure with no error: line. Pathspec commits only; never push; never git in the main checkout except read-only. Canon: the flag-off root stays byte-for-byte W2's (ContentView's legacyMainContent untouched); C4 names; C8 Companion; honesty C5. FINAL action = StructuredOutput even on failure.`
const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const REPORT = { type: 'object', required: ['ok', 'notes'], properties: { ok: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, app_path: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }
const REV = { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } } } }

phase('Fix')
const fix = await safe('F', agent(`${COMMON}

ROLE: F — implement rulings 1, 2, 3, 4, 6 and 7 on branch daily-return/integration in ${WT} (verify git rev-parse --show-toplevel; mkdir .writer.lock.d — stop if it exists). Simulator for gate + checks: ${INT_UDID} (dr-w3-int). -derivedDataPath ${WT}/.build/dd. Write ${W}/fix-tasks.md first (writing-plans format, one task per ruling), then execute in order, one Conventional Commit per ruling with pathspecs:
R1 — hoist the tour: HouseFirstRoot owns a FirstLaunchTour model for the flag-on root (DailyRoomView keeps its own on the flag-off root); the bar's .studio arm gets .firstLaunchTourAnchor(.profileMonogram) (raw value unchanged); DailyGreetingHeader.studioControl is gated off when the house-first root is active (N1's gate); step 3's popover must reach the bar (the tour publishes to the HouseFirstRoot subtree, which contains the bar). Tests: on the flag-on root the step-3 anchor mounts on the bar and the header has no Studio pill; on the flag-off root nothing changed (SourcePin on legacyMainContent unchanged).
R2 — mint AppRoute.studio: RouteTabTable.rootRoute(for: .studio) == .studio; analyticsScreenName "Your Studio"; Companion context for .studio = the Studio rows (CompanionAreaBuilders — keep ≤6); the Studio tab root renders the profile composition (identity line, the Studio hub, the Settings/Account door — exactly what the monogram opens on the flag-off root) titled "Your Studio"; RouteAnalyticsParityTests / HouseFirstRootTests updated to the honest assertion; ProfileView remains the flag-off destination of the monogram. Tests: the tab reports "Your Studio"; Settings and Account are reachable from the Studio tab root (a navigation test or SourcePin).
R3 — MoneyScreenMetrics.bottomClearance(houseFirst:) over CompanionHearthMetrics.pinnedFooterClearance(houseFirst:); the nine views (InvoiceDetailView, InvoiceListView, ProposalDetailView, ProposalListView, DecisionDetailView, DecisionListView, ProjectDetailView, BudgetView, MoneyScreenChrome) and ProductDetailView's Add to Room capsule read it with the live flag; MoneyAndStudioCopyTests:250's source pin updated to the new spelling. Tests: clearance on flag-on = bar-relative, on flag-off = dock-relative (the W1b constant).
R4 — the B-8 tour rewrite applies on both roots (N3's unconditional version restored per n3-fix-log.md's recorded revert); step 2 anchors on .todayRecord on both roots (mount the anchor on HouseRecordCard); .addToRoom retired from the step list; where the record draws nothing the step drops and the tour renumbers (existing mechanism — pin it: a guest with an empty record sees "Step 1 of 2"); FirstLaunchTourTests updated. The Sanity bodies are NOT yours (ruling 5).
R6 — tour auto-start on the flag-on root only when the Today tab is selected and its stack is empty (TabNavigationModel); the flag-off expression unchanged. Test.
R7 — one line in ${R}/11-canon-digest.md §6 (in the main checkout — it is a research file): "a push never changes tabs; only a deep link, a push notification, or a tab tap does" with the route→tab table reference; not a git-tracked worktree file — write it directly.
GATE (unsandboxed, foreground): ${APP}/scripts/ios-gate.sh build (re-run on a no-error failure); xcodebuild test -only-testing:PatinaTests on ${INT_UDID}; ${APP}/scripts/ios-gate.sh lint-delta main; signed rebuild (no CODE_SIGNING_ALLOWED=NO) → app_path; install on ${INT_UDID} and prove, with shots ${OUT}/shots/w3-fix-NN-*.png: flag-on Studio tab → Settings → Sign Out visible (do not sign out) and Delete Account present; flag-on fresh install (xcrun simctl keychain reset + uninstall/install) → tour step 3 popover on the bar's Studio tab, no header pill; flag-on invoice detail Pay footer and piece Add to Room capsule clear of the bar; flag-on: after onboarding pushes Pieces, the tour does not auto-start until Today is selected; flag-off: the W2 home unchanged (compare to ${OUT}/shots/w3-13-flagoff-today-client-final.png). rmdir the lock. Return ok, commits, gate, app_path, notes, failures.`, { label: 'F fix W3', phase: 'Fix', model: 'opus', effort: 'xhigh', schema: REPORT }))
if (!fix || !fix.ok) return { fix }

phase('Review')
const rev = await safe('V', agent(`${COMMON}

ROLE: V — reviewer of the W3 fix round, separate context, read-only (git -C ${WT} log --oneline -8; git -C ${WT} show <sha> per commit; ${W}/fix-tasks.md; report ${JSON.stringify({ commits: fix.commits, gate: fix.gate, notes: fix.notes })}). Check each ruling landed as ruled: the tour hoisted (one model per root, anchors mount where claimed, the flag-off DailyRoomView tour untouched); AppRoute.studio exhaustive in RouteTabTable and analytics parity; Settings/Sign Out/Delete Account reachable from the Studio tab (trace the navigation); clearances read the live flag in all ten files and the test pin updated, not silenced; the tour rewrite on both roots with .todayRecord and the renumber pinned; auto-start gated; the flag-off root byte-for-byte (ContentView diff still +19/-0 vs main for that file); no unrelated change; Conventional Commits with pathspecs. Write ${W}/fix-review.md; every finding with severity + confidence.`, { label: 'V review', phase: 'Review', model: 'opus', effort: 'high', schema: REV }))
if (rev && rev.blocking.length) { log(`Review blocking: ${rev.blocking.join(' | ')}`); return { fix, rev } }

let fix2 = null
if (rev && rev.major.length) {
  fix2 = await safe('F2', agent(`${COMMON}

ROLE: F2 — close the review's major findings on branch daily-return/integration in ${WT} (verify git rev-parse --show-toplevel; mkdir .writer.lock.d — stop if it exists). Read ${W}/fix-review.md in full; the majors are: ${JSON.stringify(rev.major)}. For V-1 (the step-3 popover covering the Studio tab it points at): the tour's popover arrow edge must follow the anchor — an anchor on the tab bar presents ABOVE it (arrowEdge: .bottom); header anchors keep .top; make FirstLaunchTourAnchorModifier take the edge from the anchor (or measure the anchor's position) rather than hard-coding, and pin it with a test. Address every other major the same way (change the code, or rebut in ${W}/fix2-log.md with evidence); take cheap minors. Re-run the gate exactly as F did (build; the whole PatinaTests tier on ${INT_UDID}; lint-delta main; signed rebuild → app_path; re-shoot the step-3 popover on the bar: ${OUT}/shots/w3-fix2-01-step3-above-bar.png). Pathspec Conventional Commits; rmdir the lock. Return ok, commits, gate, app_path, notes, failures.`, { label: 'F2 majors', phase: 'Fix', model: 'opus', effort: 'high', schema: REPORT }))
  if (!fix2 || !fix2.ok) return { fix, rev, fix2 }
}
const finalApp = (fix2 && fix2.app_path) || fix.app_path

phase('Re-walk')
const walk = await safe('walk', agent(`${COMMON}

ROLE: walker — W3 re-walk on ${REVIEW_UDID}. Read ${W}/walk.md (the prior pass), ${W}/rulings-fable.md (the merge rule at the end is your script), ${W}/fix-review.md. Unsandboxed: xcrun simctl install ${REVIEW_UDID} ${finalApp}. Note the capture trap in walk.md (the app's own patina.appearance override; use the documented cfprefsd + plist method for dark). FLAG ON (-DeploymentTarget local -PatinaFlags house-first): client@patina.dev → Studio tab → Settings → Sign Out visible and Delete Account present (do not perform either); the Studio tab's title reads "Your Studio"; the Today header has no Studio pill; a fresh-install guest (keychain reset + reinstall; then "Look around first") sees the tour with step 3's popover on the bar's Studio tab, and "Step 1 of 2" if the record is empty (say which); onboarding → the tour does not fire over the Pieces tab; invoice detail Pay footer, proposal Sign footer and a piece's Add to Room capsule sit clear of the bar (default + XXL); flag-on dark on Today. FLAG OFF: Today identical to w3-13-flagoff-today-client-final.png in structure; the monogram still opens Profile. Shots w3-NN (continue numbering), ledger "## w3 re-walk", rewrite ${W}/walk.md as the final record (keep the Sanity-copy FAIL as OWED-KODY, not FAIL). Leave the simulator signed in as client@patina.dev, flag off, on the Daily Room. Return ok = no FAIL.`, { label: 'walk', phase: 'Re-walk', model: 'sonnet', schema: REPORT }))
return { fix: { ok: fix.ok, commits: fix.commits, gate: fix.gate, app_path: fix.app_path, notes: fix.notes }, rev, walk }
