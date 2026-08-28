export const meta = {
  name: 'daily-return-w4-fix4',
  description: 'W4 fourth round: the house rail per the ruling (the person\'s rooms first, a visible peek, vertical wrap at accessibility sizes), then a full on-glass walk of everything rounds 3 and 4 changed, then merge-readiness',
  phases: [
    { title: 'Fix 4', detail: 'the rail ruling; nothing else' },
    { title: 'Review 4', detail: 'separate-context check' },
    { title: 'Walk', detail: 'the review device; blitz gestures only; simctl screenshots only' },
  ],
}
const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const S = `${OUT}/source`
const R = `${OUT}/research`
const W = `${OUT}/waves/w4`
const WT = `${ROOT}/.codex/worktrees/agent-dr-w4-integration`
const REVIEW_UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'
const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app. Program folder ${OUT}; read ${S}/build-plan.md "Global constraints" (INCLUDING the screen-capture rule: simulator evidence ONLY via xcrun simctl io <udid> screenshot or blitz's screenshot; NEVER screencapture / desktop capture; drive taps with blitz (explicit udid) per ${R}/02-steward-boot.md §5; if gestures stop delivering, stop and report); ${W}/rulings-fable.md (ruling 1 is the work); ${W}/fix3-log.md (the root cause and the AX frames). Sandbox: xcodebuild, xcrun simctl, git worktree/merge, osascript, docker, sips and the supabase CLI need dangerouslyDisableSandbox: true; builds in the foreground; run the gate script from the worktree's own copy. Pathspec commits only; never push; never git in the main checkout except read-only. Honesty (C5); both roots must render. FINAL action = StructuredOutput even on failure.`
const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const REPORT = { type: 'object', required: ['ok', 'notes'], properties: { ok: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, app_path: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }
const REV = { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } } } }

phase('Fix 4')
const fix = await safe('F4', agent(`${COMMON}

ROLE: F4 — implement ruling 1 on branch daily-return/integration in ${WT} (verify git rev-parse --show-toplevel; mkdir .writer.lock.d — stop if it exists). Create + boot a fresh iPhone 17 Pro / iOS 26.5 device "dr-w4-fix4" (never ${REVIEW_UDID}); -derivedDataPath ${WT}/.build/dd. In YourHouseRail (and HouseRoomCard.cards): order = the person's own rooms (typed/scanned/mirrored, newest first) → the project rooms → "Add a room"; card width = 0.72 × the container width (measure with GeometryReader or a container-relative frame; minimum 200 pt, maximum 280 pt) with a 16 pt gutter so the next card peeks; horizontal ScrollView with .scrollTargetBehavior(.viewAligned) if available on the deployment target; at dynamicTypeSize.isAccessibilitySize the rail becomes a vertical VStack of full-width cards (reuse ProfileView.roomList's pattern); heights follow content (minHeight, per round 3). Update YourHouseRailTests.projectRoomsComeFirst → personsRoomsComeFirst and add tests for the width rule and the accessibility wrap. GATE (unsandboxed, foreground): the worktree's ios-gate.sh build; xcodebuild test -only-testing:PatinaTests on dr-w4-fix4; the worktree's ios-gate.sh lint-delta main; signed rebuild → app_path. Prove on your device with simctl screenshots + describe_screen frames: client@patina.dev's Today rail shows Guest Bedroom FIRST with Dining Room peeking (AX frame x within the viewport), w4-fix4-01; XXL: the rail as a vertical list, w4-fix4-02. If gestures fail on your device, say so and rely on frames. One Conventional Commit with pathspecs; rmdir the lock; delete the device. Return ok, commits, gate, app_path, notes, failures.`, { label: 'F4 rail ruling', phase: 'Fix 4', model: 'opus', effort: 'high', schema: REPORT }))
if (!fix || !fix.ok) return { fix }

phase('Review 4')
const rev = await safe('V4', agent(`${COMMON}

ROLE: V4 — reviewer, separate context, read-only (git -C ${WT} log --oneline -6; git show per commit; report ${JSON.stringify({ commits: fix.commits, gate: fix.gate, notes: fix.notes })}). Check ruling 1 landed exactly (order, width rule, peek, accessibility wrap, heights follow content), tests updated not silenced, no unrelated change, pathspec commit. Also re-read rounds 3's four commits (89219a906, 8ce516b2b, a849b39fd, d5760170f) for anything a walk should specifically probe and list it for the walker. Write ${W}/fix4-review.md; every finding with severity + confidence.`, { label: 'V4 review', phase: 'Review 4', model: 'sonnet', schema: REV }))
if (rev && rev.blocking.length) { log(`Review blocking: ${rev.blocking.join(' | ')}`); return { fix, rev } }

phase('Walk')
const walk = await safe('walk', agent(`${COMMON}

ROLE: walker — W4 fourth walk on ${REVIEW_UDID}, blitz gestures only (ToolSearch "select:mcp__blitz-iphone__scan_ui,mcp__blitz-iphone__device_action,mcp__blitz-iphone__get_screenshot,mcp__blitz-iphone__describe_screen"; explicit udid), simctl/blitz screenshots only. Read ${W}/walk.md (your last pass), ${W}/rulings-fable.md, ${W}/fix4-review.md (the probe list). Unsandboxed: xcrun simctl keychain reset ${REVIEW_UDID}; uninstall; xcrun simctl install ${REVIEW_UDID} ${fix.app_path} (record the build's commit stamp); launch -DeploymentTarget local; sign in as client@patina.dev. Script: Today's YOUR HOUSE rail shows Guest Bedroom first with Dining Room peeking at the right edge; swipe the rail → Living Room; type a room → it appears first on the rail; Sign Out → sign in → both rooms on the rail (psql confirms rows); the same with -PatinaFlags house-first; Dynamic Type XXL (xcrun simctl ui content_size extra-extra-large): the rail is a vertical list, the story card does not overlap it (AX frames), every card tappable, dark too; un-save a piece from the Saved row's Remove and from a Browse card → the room's count drops each time (add via the picker first); the Companion sheet scrolls at XXL to its last row; the ? help panel and the room picker present on the piece screen; the claim sheet: as a guest type a room, then sign in → the claim sheet appears, choose "Keep" → the room is the account's and the hydrate lands (rail shows both); james.okafor's matched card survives the 20-day manipulation (restore). Restore text size to medium. Shots w4-NN (continue), ledger "## w4 walk 4", REWRITE ${W}/walk.md as the final record. Delete test rooms server-side. Leave the simulator signed in as client@patina.dev, flag off, on the Daily Room. NO git writes. If gestures stop delivering, stop, report which items were reached, and mark the rest BLOCKED-HARNESS. Return ok = no FAIL.`, { label: 'walk', phase: 'Walk', model: 'sonnet', schema: REPORT }))
return { fix: { ok: fix.ok, commits: fix.commits, gate: fix.gate, app_path: fix.app_path, notes: fix.notes }, rev, walk }
