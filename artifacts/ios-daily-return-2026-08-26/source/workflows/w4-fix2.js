export const meta = {
  name: 'daily-return-w4-fix2',
  description: 'W4 second fix round on the integration branch: the review\'s two blockers (Today\'s rail repaints after the reconcile; the room hydrate is scoped to the account) and three majors — then a quick review and the re-walk',
  phases: [
    { title: 'Fix 2', detail: 'B-1, B-2, M-1, M-2, M-3 from waves/w4/fix-review.md' },
    { title: 'Review 2', detail: 'separate-context check of the five fixes' },
    { title: 'Re-walk', detail: 'items 1, 4, 8 + the sign-out/sign-in room round trip on Today\'s rail' },
  ],
}
const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const S = `${OUT}/source`
const R = `${OUT}/research`
const W = `${OUT}/waves/w4`
const APP = `${ROOT}/apps/mobile/Patina`
const WT = `${ROOT}/.codex/worktrees/agent-dr-w4-integration`
const REVIEW_UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'
const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app. Program folder ${OUT}; read ${S}/build-plan.md "Global constraints"; ${W}/fix-review.md IN FULL (your brief: B-1, B-2, M-1, M-2, M-3 — and the minors you can take cheaply); ${W}/fix-tasks.md; ${W}/walk.md. Sandbox: xcodebuild, xcrun simctl, git worktree/merge, osascript, docker, sips and the supabase CLI need dangerouslyDisableSandbox: true; builds in the foreground; a first xcodebuild in a fresh tree may fail on GitCommit.swift — run twice. Pathspec commits only; never push; never git in the main checkout except read-only. Honesty (C5); SP-06 (a guest's unclaimed work is never merged into an account; an account's rooms are the account's — never another user's); both roots must render. FINAL action = StructuredOutput even on failure.`
const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const REPORT = { type: 'object', required: ['ok', 'notes'], properties: { ok: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, app_path: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }
const REV = { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } } } }

phase('Fix 2')
const fix = await safe('F2', agent(`${COMMON}

ROLE: F2 — on branch daily-return/integration in ${WT} (verify git rev-parse --show-toplevel; mkdir .writer.lock.d — stop if it exists). Create + boot a fresh iPhone 17 Pro / iOS 26.5 device "dr-w4-fix2" (unsandboxed; never ${REVIEW_UDID}); -derivedDataPath ${WT}/.build/dd. One Conventional Commit per item, pathspecs only:
B-2 (do this first — it is a data boundary): RoomsAPIClient.listRooms() takes the owner: filter user_id=eq.<the resolved user id> (the coordinator already resolves it via resolveUserId()); RoomSyncCoordinator never applies a row whose user_id differs from the signed-in account (belt and braces — test both). Test: the request carries the filter; a foreign row is rejected by the merge.
B-1: after the reconcile completes, Today's rail must repaint — the cleanest is moving HouseRoomCard's local rooms to the same live source YourSpacesView uses (an @Query / observed RoomStore) so no manual reload is needed; if you keep the snapshot, call viewModel.load() after every reconcile call site (auth listener, DailyRoomView .task, isAuthenticated onChange) and prove it with a test that a mirrored room reaches the rail in the same session. Prove on glass: sign in on a clean install → the seeded Guest Bedroom appears on Today's rail WITHOUT a background/foreground cycle (shot).
M-1: un-saving a piece removes the room's SavedItem too (and the mirror's room row if that is how it is modelled); counts on the Spaces card, the room screen and the house rail agree afterwards. Test.
M-2: the piece screen's second .sheet(isPresented:) on the root — restructure so the help panel and the room picker do not compete (one sheet driver with an enum, or the picker presented from a child); prove on glass that the ? help panel still opens on the piece screen and that the room picker opens (two shots).
M-3: "Start fresh" must not delete rooms the reconcile just inserted for the signing-in account: sequence the claim sheet's decision BEFORE the reconcile runs (the reconcile waits for the claim to resolve, or runs only after "Start fresh"/"Keep" completes), and "Start fresh" wipes only rows with remoteId == nil (the guest's) — never mirrored rows. Test both orderings.
Minors: take the cheap ones you agree with; say which.
GATE (unsandboxed, foreground): ${APP}/scripts/ios-gate.sh build; xcodebuild test -only-testing:PatinaTests on dr-w4-fix2; ${APP}/scripts/ios-gate.sh lint-delta main; supabase db reset + ./scripts/run-sql-tests.sh; signed rebuild → app_path; the on-glass proofs above as ${OUT}/shots/w4-fix2-NN-*.png. rmdir the lock; delete the device. Return ok, commits, gate, app_path, notes, failures.`, { label: 'F2 fix W4', phase: 'Fix 2', model: 'opus', effort: 'high', schema: REPORT }))
if (!fix || !fix.ok) return { fix }

phase('Review 2')
const rev = await safe('V2', agent(`${COMMON}

ROLE: V2 — reviewer of the second fix round, separate context, read-only (git -C ${WT} log --oneline -8; git show per commit; report ${JSON.stringify({ commits: fix.commits, gate: fix.gate, notes: fix.notes })}). Check each of B-1, B-2, M-1, M-2, M-3 against ${W}/fix-review.md's own fix suggestions: is the user_id filter on the request AND enforced in the merge; does the rail repaint in-session (by construction, not by luck); does un-save clear every model; do the two sheets no longer compete; does "Start fresh" wait for / exclude mirrored rows; tests real; no unrelated change; pathspec commits. Write ${W}/fix2-review.md; every finding with severity + confidence.`, { label: 'V2 review', phase: 'Review 2', model: 'opus', effort: 'high', schema: REV }))
if (rev && rev.blocking.length) { log(`Review blocking: ${rev.blocking.join(' | ')}`); return { fix, rev } }

phase('Re-walk')
const walk = await safe('walk', agent(`${COMMON}

ROLE: walker — W4 re-walk on ${REVIEW_UDID}. Read ${W}/walk.md (the prior pass), ${W}/fix-review.md, ${W}/fix2-review.md. Unsandboxed: xcrun simctl install ${REVIEW_UDID} ${fix.app_path}; terminate + launch with -DeploymentTarget local (flag off); repeat item 1 with -PatinaFlags house-first. Script: xcrun simctl keychain reset + uninstall/install for a clean sign-in as client@patina.dev → Today's house rail shows D's seeded Guest Bedroom beside the two project rooms IN THAT SESSION (no background/foreground cycle) and Your Spaces lists it; type a room → Settings → Sign Out → sign in → the room is still on Today and in Spaces (psql: rooms row with the client's user_id); save a piece into a room from the piece detail via the room picker → Saved shows date · room · note and the room's own Saved lists it; un-save it → the room's count drops; the ? help panel on the piece screen opens; a qualifying piece shows the fit line; james.okafor's matched card survives a 20-day-old created_at (restore afterwards); dark + XXL on Today and the room screen. Shots w4-NN (continue numbering), ledger "## w4 re-walk", REWRITE ${W}/walk.md as the final record (PASS/FAIL/BLOCKED per item; keep the prior passes as history). Delete any test rooms you created server-side. Leave the simulator signed in as client@patina.dev, flag off, on the Daily Room. You are a walker: NO git writes of any kind. Return ok = no FAIL.`, { label: 'walk', phase: 'Re-walk', model: 'sonnet', schema: REPORT }))
return { fix: { ok: fix.ok, commits: fix.commits, gate: fix.gate, app_path: fix.app_path, notes: fix.notes }, rev, walk }
