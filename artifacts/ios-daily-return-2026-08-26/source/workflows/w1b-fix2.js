export const meta = {
  name: 'daily-return-w1b-fix2',
  description: 'W1b last fix: the Pay-failure banner on the invoice detail must never sit under the Companion dock — fix on the integration branch, then a one-screen re-check',
  phases: [
    { title: 'Fix', detail: 'invoice detail pay footer + failure banner clear the dock' },
    { title: 'Re-check', detail: 'the walker re-shoots the Pay failure and the invoice detail at default + XXL' },
  ],
}
const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const S = `${OUT}/source`
const R = `${OUT}/research`
const W = `${OUT}/waves/w1b`
const WT = `${ROOT}/.codex/worktrees/agent-dr-w1b-integration`
const INT_UDID = '34EDD568-43AE-4546-A0FE-AB9161FF9391'
const REVIEW_UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'
const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app. Program folder ${OUT}; read ${S}/build-plan.md "Global constraints" and ${W}/rulings-fable.md ruling 1 (the orb yields on the flag-off root; W3 retires the Hearth). Sandbox: xcodebuild, xcrun simctl, git worktree/merge, osascript, docker, sips and the supabase CLI need dangerouslyDisableSandbox: true; everything else sandboxed; builds in the foreground. Pathspec commits only; never push; never git in the main checkout except read-only. FINAL action = StructuredOutput even on failure.`
const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const REPORT = { type: 'object', required: ['ok', 'notes'], properties: { ok: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, app_path: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }

phase('Fix')
const fix = await safe('F2', agent(`${COMMON}

ROLE: F2 — one fix on branch daily-return/integration in ${WT} (verify git rev-parse --show-toplevel; mkdir .writer.lock.d, stop if it exists). Evidence: ${OUT}/shots/w1b-22-pay-failure-patina-voice.png and w1b-22b-pay-failure-dock-overlap-confirm.png — on the invoice detail, after "Pay $4,250.00" fails, the failure banner ("We couldn't start this payment. Nothing has been charged.") renders above the Pay button but the Companion dock (orb + "N THINGS NEED YOUR EYE" caption) paints over it. Read Features/Invoices/Views/InvoiceDetailView.swift (payFooter, the failure banner, MoneyScreenMetrics.bottomClearance = 144), Design/Components/CompanionSafeArea.swift, and Features/Companion/Views/CompanionOverlay.swift (the dock's geometry and z-order). Fix by design, per ruling 1 (the orb yields): while a money screen shows a pinned footer (Pay / Sign) or a failure banner, the dock must not cover it — choose the smaller of: (a) the pinned footer + banner get a bottom inset equal to the dock's real height (orb + caption + spacing, measured, not 144 guessed) via the existing CompanionSafeArea mechanism, or (b) the dock collapses its caption and drops to a smaller resting state on screens that declare a pinned footer. Apply the same treatment to ProposalDetailView's "Sign proposal" footer and DecisionDetailView's action footer (the same class; ruling 8 asked for their XXL clearance). Pin with a test in InvoicesMoneyRailTests / a MoneyScreenMetrics test that the inset ≥ the dock height constant, and keep MoneyAndStudioCopyTests green. Gate (unsandboxed, foreground): ios-gate.sh build (twice if it fails without an error line); xcodebuild test -only-testing:PatinaTests on ${INT_UDID} -derivedDataPath ${WT}/.build/dd; ios-gate.sh lint-delta main; signed rebuild to ${WT}/.build/dd-signed; install on ${INT_UDID}; launch -DeploymentTarget local; reproduce the Pay failure (client@patina.dev → Profile → Studio → Invoices → INV-2026-0142 → Pay) and capture ${OUT}/shots/w1b-fix2-01-pay-failure-clear.png and, at Dynamic Type XXL (xcrun simctl ui ${INT_UDID} content_size extra-extra-large; restore to medium after), w1b-fix2-02-pay-failure-xxl.png and w1b-fix2-03-proposal-sign-xxl.png. One Conventional Commit with pathspecs; rmdir the lock. Return ok, commits, gate, app_path, notes, failures.`, { label: 'F2 fix dock overlap', phase: 'Fix', model: 'opus', effort: 'high', schema: REPORT }))
if (!fix || !fix.ok) return { fix }

phase('Re-check')
const check = await safe('walk2', agent(`${COMMON}

ROLE: walker — one-screen re-check on the review simulator ${REVIEW_UDID}. Unsandboxed: xcrun simctl install ${REVIEW_UDID} ${fix.app_path}; terminate + launch with -DeploymentTarget local (signed in as client@patina.dev; else per ${R}/02-steward-boot.md §7). Blitz taps per §5 (ToolSearch the mcp__blitz-iphone__ tools; explicit udid). Reproduce the Pay failure on INV-2026-0142 at default text size and at XXL, and open the proposal detail scrolled to "Sign proposal" at XXL: is every footer and banner fully visible with the dock not covering it? Capture ${OUT}/shots/w1b-34-pay-failure-recheck.png, w1b-35-pay-failure-xxl.png, w1b-36-proposal-sign-xxl.png; append rows to ${R}/01-shot-ledger.md under "## w1b re-walk"; update the Pay-failure line in ${W}/walk.md (find the file — it may be in the integration worktree at the same relative path — and write the final copy at ${W}/walk.md in the main checkout) to PASS or FAIL with the shot; restore content size to medium; leave the simulator signed in on the Daily Room. Return ok = PASS.`, { label: 'walk re-check', phase: 'Re-check', model: 'sonnet', schema: REPORT }))
return { fix: { ok: fix.ok, commits: fix.commits, gate: fix.gate, app_path: fix.app_path, notes: fix.notes }, check }
