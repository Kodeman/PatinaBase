export const meta = {
  name: 'daily-return-w2-r2-resume',
  description: 'W2 completion: re-dispatch lane R2 (the Record UI) on top of the integration tip that already carries D, R1 and R3; review; fix; re-integrate with two small ruled fixes; walk',
  phases: [
    { title: 'R2 record UI', detail: 'HouseRecordCard, designer seat, house rail, New This Week, greeting, Studio control, primer wiring, top-band fold — on daily-return/integration @ 59b389293' },
    { title: 'Review + fix', detail: 'separate-context review; fix round' },
    { title: 'Re-integrate', detail: 'merge r2 → integration; the thread-deletion predicate + the nudge AR dead-end; gates' },
    { title: 'Walk', detail: 'W2 acceptance, all tiers, light/dark/XXL, carry-overs' },
  ],
}

const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const S = `${OUT}/source`
const R = `${OUT}/research`
const W = `${OUT}/waves/w2`
const APP = `${ROOT}/apps/mobile/Patina`
const WT = `${ROOT}/.codex/worktrees/agent-dr-w2-r2`
const INT_WT = `${ROOT}/.codex/worktrees/agent-dr-w2-integration`
const R2_UDID = '0B472471-1E2E-4C04-825A-8668695264C1'
const REVIEW_UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'

const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app (apps/mobile/Patina). The orchestrator (Fable) reads only your structured return and your files on disk.
Ground rules:
- Program folder: ${OUT}. Read ${S}/build-plan.md "Global constraints" and "### W2" IN FULL; ${S}/rulings-2026-08-27.md (R1, Q4, Q7); ${S}/direction-b.md §1, §2, §3, §11 (M1, M1d, M2, M2d, M6d — read ${OUT}/mock/fragments/b-M1.html, b-M1.sheet.html, b-M2.html, b-M2.sheet.html, b-M6d.html); ${S}/synthesis.md §5; ${W}/steward.md (owned-file map §7, carry-overs §8, hazards §9); ${W}/integration.md (what is on the integration branch, and §7 "Open, for Fable"); ${W}/r1-notes.md §1, §3, §4, §5, §9, §10 (R2's contracts — binding); ${W}/r1-tasks.md (the published interfaces: HouseRecord, HouseRecordRow, HouseRecordBuilder.build(...), RecordSnapshotStore, LastSeenStore, StudioQueueBuilder.itemizedAwaitingRows); ${W}/r3-notes.md; ${OUT}/waves/w1b/rulings-fable.md. Load Skill "patina-parallel-work" and "patina-ios-verification".
- Sandbox: xcodebuild, xcrun simctl, git worktree/merge/checkout -B, osascript, docker, sips and the supabase CLI need dangerouslyDisableSandbox: true; everything else sandboxed; builds in the foreground; a first xcodebuild in a fresh tree may fail on GitCommit.swift — run it twice; ios-gate.sh build writes to the SHARED default DerivedData — a ** BUILD FAILED ** with no error: line is contention, re-run.
- Never git add -A; pathspec commits only; never push; never git in the main checkout except read-only; never touch production.
- Honesty (C5): a row draws only for a real event with its real date; rows with isStandingCondition draw WITHOUT a date and WITHOUT "· new"; at guest/discovering an empty record draws NOTHING and an empty half is not drawn; at engaged/activeProject the truthful empties draw; nothing counts days at the person; State.new is never emitted (isNew is the only newness signal). Brand voice (C6); canonical names (C4): the header word stays "Today".
- Report with evidence; FINAL action = StructuredOutput even on failure.`

const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const REPORT = { type: 'object', required: ['ok', 'notes'], properties: { ok: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, tasks_file: { type: 'string' }, app_path: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }
const REV = { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } } } }

const R2_BRIEF = `${COMMON}

ROLE: R2 — the Record UI, re-dispatched (the first attempt died on a server error before its first commit). WORKSPACE: the worktree ${WT} exists on branch daily-return/w2-r2 at the wave base with ZERO commits and a STALE lock (owner dead — orchestrator verified). Unsandboxed: cd ${WT}; rmdir .writer.lock.d; git checkout -B daily-return/w2-r2 daily-return/integration (rebase the empty lane onto the integration tip 59b389293 so you build against R1's real interfaces and R3's deletions); mkdir .writer.lock.d; verify git rev-parse --show-toplevel ends with agent-dr-w2-r2 and git log --oneline -1 shows 59b389293. Secrets.swift is already in place. Simulator: ${R2_UDID} (dr-w2-r2, booted). -derivedDataPath ${WT}/.build/dd on every xcodebuild.
TASK LIST FIRST: ${W}/r2-tasks.md in the writing-plans format (exact files, failing test code, run, implement, run, pathspec commit), one task per item below. Read the code before writing (Serena scoped to apps/mobile/Patina, or grep + Read).
DELIVER (per direction-b §2 and the M1/M2 sheets; owned files per steward.md §7 — Features/Home/Views/**, Features/Home/ViewModels/**, Features/Home/Models/TodayExperience.swift, Core/Network/EditorialStoriesAPIClient.swift, plus the carry-over 8a files named in steward.md §8a; ContentView.swift ONLY for the markSeen wiring if it cannot live in DailyRoomView):
1. HouseRecordCard — one card, two eyebrows NEEDS YOU / MOVED (DM Mono), rows 56 pt with the row's date and state on the right (overdue / by <date> / $4,250.00 · due Sep 1); rows with isStandingCondition draw no date and no "· new"; a "· new" tick from isNew only; "See all →" when hasMore; empties per tier ("Nothing needs you right now." / "Nothing moved since <weekday>." at engaged/activeProject; nothing drawn at guest/discovering); VoiceOver label per row; the copy ruling for MJ-5: a decision row reads "<Designer first name> asked about <decision title>." when the decision has a title, "<Designer full name> asked you to choose." only as the fallback.
2. The record's data path in DailyRoomViewModel: on appear and on scenePhase → .active, paint RecordSnapshotStore.shared.load() FIRST, then build via HouseRecordBuilder.build(from: BadgeCountService.shared, saved:, products:, story:, liveLead: DesignRequestStatusService.shared.liveLead, lastSeen: LastSeenStore.shared.lastSeenAt, now:, previous:) — the products argument is the saved pieces' products fetched BY ID including withdrawn ones (add the smallest read to the existing product client: a select over products by id list without the deleted_at filter — ProductAPIClient is unowned by every W2 lane, so make that one addition, name it in your notes; get_recommendations cannot supply withdrawn rows) — then RecordSnapshotStore.shared.save(record), then LastSeenStore.shared.markSeen() AFTER the build, never before (r1-notes §3).
3. The header: date line, TimeOfDay greeting, the bell, the "Studio" labelled control with BadgeCountService.shared.attentionCount (replaces the bare monogram; AttentionCountTests pins that DailyRoomView.swift reads badges.studioHint — keep that read at that exact path).
4. YourDesignerSeat (name · studio · one line of what she is doing from liveLead / project state · "Message" via MessagingAPIClient.createThread(projectId:)) — from engaged upward.
5. YourHouseRail — project rooms read-only cards (project_rooms is readable by the client — steward.md proves it; real budget/committed cents when present) + local rooms + "Add a room"; the guest/discovering "Start with a room" two-act block ("Type the dimensions" first, "Scan it" second).
6. NewThisWeekRail — get_recommendations rows with published_at ≤ 7 days; draws only at ≥3 rows, never pads.
7. The story block demoted below the record when nothing published since last seen; EditorialStoriesAPIClient ordered published_at desc, sort_order desc; the unread dot from SP-18's stored read id.
8. Next Move: keep it as the second block only when the record has no NEEDS YOU rows; the empty-queue Next Move names current_phase.
9. Card weight follows content: the record takes the hero footprint when non-empty; the story drops to a 96 pt row.
10. Home composition per tier exactly as direction-b §2 (guest / discovering / engaged / activeProject); the record is UNFLAGGED; dark + Dynamic Type XXL clean.
11. The push primer (W1b lane C's PushPrimerView) fires before the first client-facing money push — verify its trigger still works over the recomposed home; do not redesign it.
12. Carry-over 8a: fold .moneyScreenTopBand() into PatinaScreenChrome so one modifier owns the status-bar reservation; the nine call sites read the shared modifier; delete the duplicate (files per steward.md §8a; R3 already changed ProposalDetailView.swift:83 on the integration branch — you are on top of it, so no conflict).
Tests: composition per tier (which blocks mount), empties per tier, standing-condition rows draw no date, hero/96 pt weighting, snapshot-first paint then rebuild, markSeen ordering (a test that stamps only after build), the Studio control count, the top-band fold (a SourcePin that no call site uses .moneyScreenTopBand). Keep AttentionCountTests, CompanionHomeMenuMatrixTests, HouseRecord* suites green.
GATE (unsandboxed, foreground): ${APP}/scripts/ios-gate.sh build (twice if it fails without an error line); xcodebuild test -project ${WT}/apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug -destination 'platform=iOS Simulator,id=${R2_UDID}' -derivedDataPath ${WT}/.build/dd -only-testing:PatinaTests — the whole tier passes; signed .app (no CODE_SIGNING_ALLOWED=NO) → app_path.
SIM CHECK on ${R2_UDID} with -DeploymentTarget local (the local DB is seeded from the integration branch at 00538): client@patina.dev (activeProject: NEEDS YOU rows with dates and states, Leah's seat, project rooms, story below), james.okafor@example.com (engaged: "Leah Hartwell picked up your request." as a standing row, seat with Message), guest (nothing drawn for an empty record; Start with a room). Shots ${OUT}/shots/w2-r2-NN-*.png light + dark + XXL; ledger rows under "## w2-r2". Pathspec commits, Conventional Commits; rmdir the lock; git status --porcelain -uno empty. Return ok, commits, gate, tasks_file, app_path, notes (every deviation from the brief and why), failures.`

phase('R2 record UI')
const r2 = await safe('R2', agent(R2_BRIEF, { label: 'R2 record UI', phase: 'R2 record UI', model: 'opus', effort: 'high', schema: REPORT }))
if (!r2 || !r2.ok) return { r2 }

phase('Review + fix')
const rev = await safe('R2 review', agent(`${COMMON}

ROLE: reviewer of R2, separate context, read-only (git -C ${WT} diff daily-return/integration...HEAD; git -C ${WT} log --oneline daily-return/integration..HEAD; ${W}/r2-tasks.md; report ${JSON.stringify({ commits: r2.commits, gate: r2.gate, notes: r2.notes })}). Check every item of the R2 brief against direction-b §1/§2/§3, the M1/M2/M6d sheets, r1-notes §3/§9/§10 (standing-condition rows without date/new; markSeen after build; State.new never switched on; no row for the two unbuilt mock rows), the synthesis grafts, honesty per tier (nothing drawn at guest/discovering when empty), snapshot-first paint, the products-by-id fetch including withdrawn rows, the MJ-5 copy ruling, the Studio control count read path (AttentionCountTests), the top-band fold with zero remaining .moneyScreenTopBand sites, VoiceOver labels, dark + XXL, tests real and failing-without-the-change, existing suites green per the gate, no edits outside the owned set beyond the two named exceptions (ProductAPIClient by-id read; ContentView markSeen), pathspec Conventional Commits. Write ${W}/r2-review.md; every finding with severity + confidence.`, { label: 'R2 review', phase: 'Review + fix', model: 'opus', effort: 'high', schema: REV }))
let fix = null
if (rev && (rev.blocking.length || rev.major.length)) {
  fix = await safe('R2 fix', agent(`${R2_BRIEF}

FIX ROUND (replaces "TASK LIST FIRST" and the workspace rebase — the lane is implemented on daily-return/w2-r2 in ${WT}; just verify the toplevel and take the lock): read ${W}/r2-review.md; address EVERY blocking and major (change the code, or rebut in ${W}/r2-fix-log.md with evidence); take cheap minors; re-run the gate exactly; pathspec-commit each fix. Findings: blocking=${JSON.stringify(rev.blocking)} major=${JSON.stringify(rev.major)}`, { label: 'R2 fix', phase: 'Review + fix', model: 'opus', effort: 'high', schema: REPORT }))
  if (!fix || !fix.ok) return { r2, rev, fix }
}

phase('Re-integrate')
const integ = await safe('re-integrate', agent(`${COMMON}

ROLE: steward — complete W2's integration in ${INT_WT} (branch daily-return/integration @ 59b389293; verify toplevel; mkdir .writer.lock.d). Unsandboxed: git merge --no-ff daily-return/w2-r2 -m "chore(daily-return): integrate w2 lane r2" (R2 branched from this tip, so the merge should be trivial; resolve by intent if not). Then two small ruled fixes on the integration branch, each its own pathspec commit with a test: (a) integration.md §7 item 3 — 00538's thread-deletion clause is narrowed: a thread the client started is deleted only when it holds no designer-authored message; otherwise the client's messages are anonymized to the tombstone and the thread is kept (edit supabase/migrations/00538_*.sql in place — it is unmerged, so editing is allowed; update account_purge_test.sql; supabase db reset + scripts/run-sql-tests.sh); (b) integration.md §7 item 5 — the second AR dead-end in CompanionContextProvider.nudge (r3-notes §2): no AR nudge while the product has no usdz_url; pin in the Companion tests. Then the full gate: ${APP}/scripts/ios-gate.sh build; the whole PatinaTests tier on the dr-w2-* device you create or reuse (never ${REVIEW_UDID}); ${APP}/scripts/ios-gate.sh lint-delta main; supabase db reset + SQL tests; deno test for delete-account; database.types.ts regen diff empty; signed .app. Update ${W}/integration.md (append "§9 — completion" with the merge, the two fixes, the gates). Return ok only if every gate is green; app_path set.`, { label: 're-integrate', phase: 'Re-integrate', model: 'opus', effort: 'high', schema: REPORT }))
if (!integ || !integ.ok) return { r2, rev, fix, integ }

phase('Walk')
const walk = await safe('walk', agent(`${COMMON}

ROLE: walker — W2 acceptance on ${REVIEW_UDID}. Read ${W}/integration.md (incl. §9) and the "Acceptance:" paragraph of build-plan.md §W2 — your script — plus direction-b §1 "The day" and the carry-overs in the W2 walker brief of ${S}/workflows/w2-record.js (the primer observation; XXL on the proposal detail's Sign clearance, a decision detail, Budget, an invoice detail). Unsandboxed: xcrun simctl install ${REVIEW_UDID} ${integ.app_path}; terminate + launch with -DeploymentTarget local. Accounts per ${R}/02-steward-boot.md §6–§7 (client@patina.dev activeProject; james.okafor@example.com engaged; guest). Two-weeks header: write patina.house.lastSeenAt 14 days ago into the app's group/app-container defaults (find the suite the store uses in Core/Persistence/LastSeenStore.swift — App Group first, app container fallback on an ad-hoc build; xcrun simctl spawn ${REVIEW_UDID} defaults write <suite> patina.house.lastSeenAt -date <iso>) and relaunch; "new" tick: yesterday. Blitz taps per §5 with explicit udid. Capture w2-NN-*.png (light, dark, XXL for the home at each tier + the four XXL money screens), ledger rows under "## w2 walk", ${W}/walk.md with PASS/FAIL/BLOCKED per item and verbatim copy for every FAIL. Leave the simulator signed in as client@patina.dev on the Daily Room. Return ok = no FAIL.`, { label: 'walk', phase: 'Walk', model: 'sonnet', schema: REPORT }))
return { r2: { ok: r2.ok, commits: r2.commits, gate: r2.gate, notes: r2.notes, failures: r2.failures }, rev, fix: fix && { ok: fix.ok, commits: fix.commits }, integ: { ok: integ.ok, gate: integ.gate, app_path: integ.app_path, notes: integ.notes, failures: integ.failures }, walk: walk && { ok: walk.ok, notes: walk.notes, failures: walk.failures } }
