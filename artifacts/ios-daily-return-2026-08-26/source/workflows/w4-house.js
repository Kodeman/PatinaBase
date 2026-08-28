export const meta = {
  name: 'daily-return-w4-house',
  description: 'W4 of the Daily Return build: the house on Today — rooms with real numbers and budgets, saved-row date/room/note, the 14-day decays removed, the project timeline, last-seen mirror, the seat picks the right project — two owned-file lanes + backend 00539, reviewed, integrated, walked',
  phases: [
    { title: 'Steward setup', detail: 'worktrees, clones, owned-file map' },
    { title: 'Lanes', detail: 'H1 rooms & budget ∥ H2 saved rows, decays, timeline, seat ∥ D backend 00539' },
    { title: 'Reviews + fix', detail: 'three separate-context reviews; fix rounds' },
    { title: 'Integrate', detail: 'D → H1 → H2; gates' },
    { title: 'Walk', detail: 'acceptance on the review simulator, flag on and off' },
  ],
}

const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const S = `${OUT}/source`
const R = `${OUT}/research`
const W = `${OUT}/waves/w4`
const APP = `${ROOT}/apps/mobile/Patina`
const REVIEW_UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'
const LANES = [
  { key: 'h1', name: 'H1 · rooms & budget', model: 'opus', reviewer: 'sonnet' },
  { key: 'h2', name: 'H2 · saved rows, decays, timeline, seat', model: 'opus', reviewer: 'opus' },
  { key: 'd', name: 'D · backend 00539', model: 'opus', reviewer: 'sonnet' },
]
const wt = (k) => `${ROOT}/.codex/worktrees/agent-dr-w4-${k}`
const br = (k) => `daily-return/w4-${k}`

const COMMON = `You are one agent in the Daily Return build program for the Patina iOS CLIENT app (apps/mobile/Patina). The orchestrator (Fable) reads only your structured return and your files on disk.
Ground rules:
- Program folder: ${OUT}. Read ${S}/build-plan.md "Global constraints", "### W2 — DONE" (the carry-overs are yours), "### W3" (what landed; the tab bar is behind house-first — everything you build must render on BOTH roots), "### W4" IN FULL; ${S}/direction-b.md §3 (the investment the app remembers), §2 (Your house), §9 W3 row, §11 M2/M4 (read ${OUT}/mock/fragments/b-M2.html, b-M4.html and their .sheet.html); ${OUT}/waves/w2/walk.md and r2-notes.md §4 (what W2 left open); ${OUT}/waves/w3/integration.md and walk.md (what W3 left). Load Skill "patina-parallel-work"; iOS lanes also "patina-ios-verification"; D also "patina-db-migrations".
- Sandbox: xcodebuild, xcrun simctl, git worktree/merge, osascript, docker, sips and the supabase CLI need dangerouslyDisableSandbox: true; everything else sandboxed; builds in the foreground; the first xcodebuild in a fresh tree may fail on GitCommit.swift — run it twice; ios-gate.sh build writes to the SHARED default DerivedData — a ** BUILD FAILED ** with no error: line is contention, re-run.
- Never git add -A; pathspec commits only; never push; never git in the main checkout except read-only; never touch production.
- Owned files: edit ONLY your lane's set (${W}/steward.md is authoritative); cross-lane needs → ${W}/<lane>-notes.md integration notes.
- Honesty (C5): a number drawn is a number stored; "$3,590 saved · your range $5K+" prints the quiz's own band label, never a derived figure (synthesis graft); a fit line prints numbers, never a promise; no decay deletes a fact — a matched request stays until it resolves. Brand voice (C6); canonical names (C4).
- Report with evidence; FINAL action = StructuredOutput even on failure.`

const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }
const REPORT = { type: 'object', required: ['ok', 'notes'], properties: { ok: { type: 'boolean' }, commits: { type: 'array', items: { type: 'string' } }, gate: { type: 'string' }, tasks_file: { type: 'string' }, app_path: { type: 'string' }, migrations: { type: 'array', items: { type: 'string' } }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }
const REV = { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } } } }

phase('Steward setup')
const setup = await safe('S', agent(`${COMMON}

ROLE: S — steward setup for W4. Base = current main tip (W3 merged): record git -C ${ROOT} log --oneline -1 main. Unsandboxed: for each key in [h1, h2, d]: git -C ${ROOT} worktree add ${ROOT}/.codex/worktrees/agent-dr-w4-<key> -b daily-return/w4-<key> main; copy ${APP}/Patina/App/Configuration/Secrets.swift in. For h1 and h2: shut the review device down briefly, xcrun simctl clone ${REVIEW_UDID} "dr-w4-<key>", re-boot the review device, boot the clones (W2's steward did exactly this; under a minute). Delete leftover dr-w3-* devices; remove merged agent-dr-w3-* worktrees. Record the migration tip (expect 00538) and D's provisional number 00539. Write ${W}/steward.md with the OWNED-FILE MAP: H1 = Features/Rooms/**, Features/Home/Views/YourHouseRail.swift, Features/Home/Views/StartWithARoom*.swift if present, Core/Persistence/RoomStore.swift, Core/Network/RoomsAPIClient.swift, Core/Models/RoomModel.swift (+ tests); H2 = Features/Collections/**, Core/Models/TableItemModel.swift, Features/DesignServices/** (the 14-day windows), Services/DesignServices/DesignRequestStatusService.swift, Features/Projects/** (timeline), Features/Home/Views/YourDesignerSeat.swift, Features/Home/Views/DailyStoryCard.swift + Core/Models/DailyStory*.swift (publish date), Core/Network/EditorialStoriesAPIClient.swift, Services/Auth/** for the last_seen_at mirror call (+ tests); D = supabase/migrations/00539_*.sql, supabase/tests/**, packages/supabase/src/database.types.ts, seeds. Return ok, notes.`, { label: 'S setup', phase: 'Steward setup', model: 'opus', schema: REPORT }))
if (!setup || !setup.ok) return { setup }

phase('Lanes')
const laneBrief = (l) => `${COMMON}

ROLE: implementer of lane ${l.name} for W4. Read ${W}/steward.md. WORKSPACE: cd ${wt(l.key)}; verify git rev-parse --show-toplevel; mkdir .writer.lock.d (exists → stop); -derivedDataPath ${wt(l.key)}/.build/dd on every xcodebuild. TASK LIST FIRST: ${W}/${l.key}-tasks.md (writing-plans format). Read the code before writing.
${l.key === 'h1' ? `H1 DELIVERS: (1) rooms with real numbers on the house rail and the room screen — sq ft from the stored dimensions, piece count, and a budget: rooms.budget_cents (00537) read local-first from RoomModel and mirrored on sync; "Edit dimensions" and "Set a budget" acts on the room (M4) using the segmented ft/m control from W1b; (2) where a project owns the room (project_rooms), the card shows real budget_cents / committed_cents read-only and no edit act; (3) the room's own dated state line ("you added the Brass Arc Floor Lamp on Tuesday") — dated state, never news; (4) the fit line on a piece ("Your Living Room's longest wall is 18 ft. This table is 7 ft.") draws only for a room measured after W1b's segmented control landed (a measuredWith flag on RoomModel, defaulting false for pre-existing rooms); (5) the guest/discovering "Start with a room" block keeps "Type the dimensions" first. Tests: budget local-first + mirror, project-room read-only, the measuredWith gate, the fit line's numbers.` : ''}
${l.key === 'h2' ? `H2 DELIVERS: (1) Saved rows carry the save date, the room, and a note (saved_items.note via 00539 — local-first on TableItemModel, mirrored); the note is a plain sheet, no compare surface (B §10); (2) the two 14-day decays removed: DesignRequestStatusService's isVisibleForPromotion no longer hides a matched request after 14 days or after a dismissal at the current stage — a matched request stays visible until it resolves (the dismissal only collapses the card for that session); the Companion coaching graduation at 14 days is NOT this (leave it); (3) the project timeline: ProjectDetailView renders the phases the detail already fetches (project_phases → a vertical timeline with the current phase marked; F76/F125) — the data is on the wire, draw it; (4) the designer seat picks the project carrying the most urgent NEEDS YOU item (from HouseRecord.needsYou's first row's project), else the most recently updated active project (W2 walk finding); the seat's line must not duplicate the Next Move at engaged — when they would read the same, the seat's line names the studio and stage instead; (5) the story card's publish date chip ("AUG 25 · 4 MIN") from DailyStory.publishedAt (add the decode); (6) profiles.last_seen_at mirror: after LastSeenStore.markSeen(), one PATCH on the client's own profiles row (RLS owner update) — best effort, never blocks. Tests for each.` : ''}
${l.key === 'd' ? `D DELIVERS: 00539_saved_items_note.sql — ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS note text; a length check (≤ 2000); comment; pgTAP case; supabase db reset (unsandboxed — you own the DB this wave) replays clean; regen packages/supabase/src/database.types.ts; re-check ls supabase/migrations | tail before your final commit (renumber if 00539 collided). Also seed ONE local room for client@patina.dev in supabase/seed (rooms row with dimensions + budget_cents) so the walk has a typed room beside the project rooms — read the rooms schema and RLS first; wire it into config.toml [db.seed] per the file's derivation rule.` : ''}
${l.key !== 'd' ? `GATE (unsandboxed, foreground): ${APP}/scripts/ios-gate.sh build (twice if needed); xcodebuild test -project ${wt(l.key)}/apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug -destination 'platform=iOS Simulator,id=<your clone udid>' -derivedDataPath ${wt(l.key)}/.build/dd -only-testing:PatinaTests — whole tier green; no ios-gate.sh all / lint-delta. Signed .app → app_path. SIM CHECK on your clone with -DeploymentTarget local, both with and without -PatinaFlags house-first; shots ${OUT}/shots/w4-${l.key}-NN-*.png; ledger rows under "## w4-${l.key}".` : 'Gate output pasted.'}
FINISH: rmdir .writer.lock.d; git status --porcelain -uno empty. Return ok, commits, gate, tasks_file, app_path / migrations, notes, failures.`

const laneResults = await parallel(LANES.map(l => () => safe(l.key, agent(laneBrief(l), { label: `lane ${l.key}`, phase: 'Lanes', model: l.model, effort: 'high', schema: REPORT }))))
log(`Lanes: ${LANES.map((l, i) => `${l.key}:${laneResults[i] ? laneResults[i].ok : 'NULL'}`).join(' ')}`)

phase('Reviews + fix')
const reviews = await parallel(LANES.map((l, i) => () => laneResults[i] && laneResults[i].ok ? safe(`rev ${l.key}`, agent(`${COMMON}

ROLE: reviewer of lane ${l.name} (W4), separate context, read-only (git -C ${wt(l.key)} diff main...HEAD; log; ${W}/${l.key}-tasks.md; report ${JSON.stringify({ commits: laneResults[i].commits, gate: laneResults[i].gate, notes: laneResults[i].notes, failures: laneResults[i].failures })}). Check every delivered item against the lane brief in build-plan.md §W4 + §W2-DONE carry-overs and direction-b §3: honesty of every number and line; both roots (flag on/off) render; local-first + mirror correctness; the decays truly removed without hiding anything else; the seat's project rule; tests real; no edits outside the owned set; pathspec Conventional Commits. Write ${W}/${l.key}-review.md; every finding with severity + confidence.`, { label: `review ${l.key}`, phase: 'Reviews + fix', model: l.reviewer, effort: l.reviewer === 'opus' ? 'high' : undefined, schema: REV })) : Promise.resolve(null)))
const fixes = await parallel(LANES.map((l, i) => () => (reviews[i] && (reviews[i].blocking.length || reviews[i].major.length)) ? safe(`fix ${l.key}`, agent(`${laneBrief(l)}

FIX ROUND (replaces "TASK LIST FIRST"): the lane is on ${br(l.key)} in ${wt(l.key)}; read ${W}/${l.key}-review.md; address every blocking and major (change or rebut in ${W}/${l.key}-fix-log.md); re-run the gate; pathspec commits. Findings: ${JSON.stringify({ blocking: reviews[i].blocking, major: reviews[i].major })}`, { label: `fix ${l.key}`, phase: 'Reviews + fix', model: l.model, effort: 'high', schema: REPORT })) : Promise.resolve(null)))

phase('Integrate')
const integ = await safe('integrate', agent(`${COMMON}

ROLE: steward — integrate W4. Unsandboxed: git -C ${ROOT} worktree add ${wt('integration')} -b daily-return/integration main; copy Secrets.swift; mkdir .writer.lock.d; create + boot "dr-w4-int" (fresh iPhone 17 Pro / iOS 26.5). Merge d → h1 → h2 (subjects "chore(daily-return): integrate w4 lane <x>"); resolve by intent; apply ${W}/*-notes.md. Migrations: check the tip, renumber if needed, supabase db reset, SQL tests, regen types if stale. iOS: ios-gate.sh build; the whole PatinaTests tier on your device; ios-gate.sh lint-delta main; signed .app; both roots launch. Write ${W}/integration.md. Return ok only if every gate is green.`, { label: 'integrate', phase: 'Integrate', model: 'opus', effort: 'high', schema: REPORT }))

phase('Walk')
const walk = integ && integ.ok ? await safe('walk', agent(`${COMMON}

ROLE: walker — W4 acceptance on ${REVIEW_UDID}. Read ${W}/integration.md and build-plan.md §W4 + §W2-DONE carry-overs. Unsandboxed: install ${integ.app_path}; terminate + launch with -DeploymentTarget local (flag off), then again with -PatinaFlags house-first. Accounts per ${R}/02-steward-boot.md §6–§7. Script: client@patina.dev — the house rail shows the seeded typed room with sq ft + budget beside the two project rooms with real budget/committed; the room screen's Edit dimensions + Set a budget acts work and persist across relaunch; the seat names the project carrying the open NEEDS YOU items (Aspen Loft Refresh) and Message opens that project's thread; a Saved row shows save date + room + a note after adding one; the project detail shows the phase timeline with the current phase marked; the story card shows its publish date; james.okafor@example.com — the matched request card is still visible (no 14-day decay: manipulate the lead's created_at to 20 days ago in local Postgres, unsandboxed, then relaunch); a piece detail shows the fit line only for a room measured with the segmented control; dark + XXL on the home and the room screen. Shots w4-NN-*.png; ledger under "## w4 walk"; ${W}/walk.md PASS/FAIL per item. Leave the simulator signed in as client@patina.dev, flag off, on the Daily Room. Return ok = no FAIL.`, { label: 'walk', phase: 'Walk', model: 'sonnet', schema: REPORT })) : null

return { setup: setup.notes, lanes: LANES.map((l, i) => ({ lane: l.key, impl: laneResults[i] && { ok: laneResults[i].ok, commits: laneResults[i].commits, gate: laneResults[i].gate, failures: laneResults[i].failures }, review: reviews[i] && { blocking: reviews[i].blocking, major: reviews[i].major, minor_n: reviews[i].minor.length }, fix: fixes[i] && { ok: fixes[i].ok, commits: fixes[i].commits } })), integration: integ && { ok: integ.ok, gate: integ.gate, app_path: integ.app_path, notes: integ.notes, failures: integ.failures }, walk: walk && { ok: walk.ok, notes: walk.notes, failures: walk.failures } }
