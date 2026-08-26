export const meta = {
  name: 'document-wayfinding-w2-panel',
  description: 'W2: 5 UX/UI lenses + 4 interior-design personas review the evidence pack in parallel; semantic collation; 3 refuters (code-truth, canon-truth, live repro); verified findings written to the program folder',
  phases: [
    { title: 'Panel', detail: 'U1–U5 and P1–P4 in parallel, each walking T1–T16 over the same evidence pack' },
    { title: 'Collate', detail: 'JS exact-key dedup, then one Sonnet collator merges semantically into canonical findings' },
    { title: 'Verify', detail: 'steward boots portal; V1 code-truth ∥ V2 canon-truth ∥ V3 live repro; JS survival; scribe writes 31-verified' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const OUT = `${REPO}/artifacts/document-wayfinding-directions-2026-08-25`

const PROGRAM = `You are one agent in "The Document — Wayfinding Review" (2026-08-25): a multi-agent design review of the Patina designer portal's document surface — /desk (landing) + /doc/[id] (one paper per engagement) + the Studio Drawer + ⌘K + shelves + the Drafting Room. Patina connects interior designers with makers of custom furnishings. The two goals under review: is it always obvious to a designer WHAT TO DO NEXT, and HOW TO GET TO the items she needs (rooms, products, boards, plans/spec book, money, schedule, people). Nothing in the product is changed by this program. Repo ${REPO}; verified against main@695addb5f.

HARD RULES
1. Durable path: write your deliverable to the exact path you are given under ${OUT}/ (mkdir -p as needed). The orchestrator reads the FILE. Never write to /tmp or a scratchpad.
2. Forbidden: git add/commit/stash/push; editing anything under apps/, packages/, supabase/, docs/; starting or stopping dev servers (only the STEWARD agent may). You MAY write new files under ${OUT}/ only.
3. Report EVERY finding with severity AND confidence — do not filter by perceived importance; the orchestrator filters. Recall beats precision here.
4. Quote what is on screen verbatim (labels exactly as printed, including case and middots). Never paraphrase a label.
5. Your final message must be the structured output requested (schema enforced). The full report goes to the report_path.`

const EVIDENCE = `EVIDENCE PACK (read all of these before judging; paths are absolute):
- ${OUT}/source/instruments.md — §1 the task script T1–T16 (run all sixteen, in order, as one week), §2 personas, §3 lens briefs, §4 the finding schema, §5 the canon guard (what is already ruled), §8 the mock specimen (ignore for now).
- ${OUT}/research/10-code-anatomy.md — §4 guide copy verbatim, §6 LABEL INVENTORY (every visible string with file:line), §7 reachability inventory (act counts; ⌘K-only doors), §5 width regime, §3 registries.
- ${OUT}/research/11-canon-digest.md — (A) constraint ledger, (B) known-open list, (E) glossary of the product's nouns.
- ${OUT}/research/01-shot-ledger.md — every screenshot, what it shows, unreachable states, then '## Flag-on (Worktable)' with the first plain-words description of the four stage tables.
- ${OUT}/probe/01-interactive-probe.md — dynamic behavior: hover, Esc chain, chords, scroll-spy, fold persistence, focus return, room-lens strand, console, timings.
- ${OUT}/shots/*.png — prefixes w1440- (full tier), w1280- (compact tier), m390- (mobile), wt- (Worktable, flag on). Open images with the Read tool. MINIMUM SET to view: w1440-desk, w1280-desk, m390-desk; w1440-doc-project-rich, w1280-doc-project-rich, m390-doc-project-rich; w1440-doc-brief, w1440-doc-discovery, w1440-doc-direction, w1440-doc-proposal-sent, w1440-doc-install, w1440-doc-care; w1440-spine-detail, w1280-spine-detail, w1440-shelves-block, w1440-running-index-midscroll, w1440-shelf-planroom, w1440-shelf-specbook, w1440-shelf-moodboards, w1440-shelf-knowledge, w1440-red-letter-zone, w1440-money-region, w1440-record-foot, w1440-guide-proposal-sent, w1440-install-section, w1440-care-band, w1440-cmdk-open, w1440-cmdk-typed, w1440-drawer-strip, w1440-drawer-books, w1440-ledger-sheet-orders, w1440-room-library, w1440-leaf-plans-route, w1440-leaf-specbook-route, w1440-drafting-route, m390-mobile-bar, m390-mobile-spine-sheet, m390-mobile-margin-chips; and the Worktable: wt-intake-1440, wt-speccing-1440, wt-speccing-tools, wt-finalize-1440, wt-finalize-head, wt-delivery-project-1440, wt-delivery-install-1440, wt-delivery-project-390. (Use ls ${OUT}/shots to see exact names; some listed names may differ slightly — the ledger is authoritative.)

CAVEATS YOU MUST HONOR
- Capture artifact: in fullPage screenshots the FIXED bottom Studio Drawer strip (wordmark · Library · People · The Rooms · Studio books · in-hand time · The Post · account) lands mid-image at the original viewport-bottom position. That placement is the harness, not the product. Judge the strip from the w1440-drawer-* viewport shots.
- Seed data is synthetic: 'Chen Residence' has no client linked; the direction doc prints a seed description ('Draft fixture for a no-login household: proposals.designer_client_id …') which is SEED TEXT rendered as the proposal's description, not product copy. Do not report seed text as product copy — but you MAY report that the paper renders a free-text description in that position if that itself is a wayfinding issue.
- Data drift: the local DB was reset mid-run; Chen Residence's id in state-ladder.json is stale (live id 2992a486-b2bd-4139-9e51-33ed1621c59c). Irrelevant to you unless you cite ids.
- The compact tier (1180–1439, w1280-*) shows a 56px unlabeled glyph rail and a closed 'MARGIN ←' tab; the shelved-spine blocks (running index / rooms / shelves) exist ONLY at ≥1440 by ruling (C8). Report what that costs, and mark already_ruled with the canon id when a finding runs against a ruling — it is still a valid finding, just not free for Direction A.
- Flag states: w1440/w1280/m390 shots are flag-off (what a designer sees today); wt- shots are the Worktable (flag on, ruled as the destination, never before seen by a human). Set finding.flag accordingly ('both' when the issue exists in both).
- You cannot click anything. This is a cognitive walkthrough over screenshots + the label inventory + the probe log. Where you would need to click to know, say what you EXPECT to happen, mark confidence accordingly, and cite the anatomy line that tells you what actually happens.`

const FINDING_SCHEMA = { type: 'object', properties: {
  who: { type: 'string', description: 'U1..U5 or P1..P4' },
  report_path: { type: 'string' },
  overall: { type: 'string', description: '≤120 words: the one thing that most breaks obviousness, from this seat' },
  task_scores: { type: 'array', items: { type: 'object', properties: {
    task: { type: 'string' }, what_to_do: { type: 'number' }, how_to_get_there: { type: 'number' }, note: { type: 'string' } },
    required: ['task', 'what_to_do', 'how_to_get_there', 'note'] }, description: 'one row per T1..T16, obviousness 1-5 each (lenses estimate for their persona-of-record)' },
  findings: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, task_ids: { type: 'array', items: { type: 'string' } },
    key: { type: 'string', description: 'surface|width|flag|kebab-slug' },
    surface: { type: 'string' }, width: { type: 'string', enum: ['1440', '1280', '390', 'all'] }, flag: { type: 'string', enum: ['off', 'on', 'both'] },
    title: { type: 'string' }, observation: { type: 'string' },
    why_it_blocks: { type: 'string', enum: ['obvious-what-to-do', 'obvious-how-to-get-there', 'both'] },
    evidence_shots: { type: 'array', items: { type: 'string' } }, evidence_refs: { type: 'array', items: { type: 'string' } },
    severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] }, confidence: { type: 'number' },
    already_ruled: { type: 'string', description: 'DECISIONS id or empty string' }, suggested_fix: { type: 'string' },
    hesitation_seconds_estimate: { type: 'number' } },
    required: ['id', 'task_ids', 'key', 'surface', 'width', 'flag', 'title', 'observation', 'why_it_blocks', 'evidence_shots', 'evidence_refs', 'severity', 'confidence', 'already_ruled', 'suggested_fix', 'hesitation_seconds_estimate'] } },
}, required: ['who', 'report_path', 'overall', 'task_scores', 'findings'] }

const SEATS = [
  { key: 'U1', n: 0, model: 'opus', kind: 'lens', title: 'Information architecture & wayfinding' },
  { key: 'U2', n: 1, model: 'sonnet', kind: 'lens', title: 'Interaction & flow / next-action clarity' },
  { key: 'U3', n: 2, model: 'sonnet', kind: 'lens', title: 'Visual hierarchy & layout across the three width tiers' },
  { key: 'U4', n: 3, model: 'sonnet', kind: 'lens', title: 'Content design & lexicon' },
  { key: 'U5', n: 4, model: 'sonnet', kind: 'lens', title: 'Reach — keyboard, mobile, accessibility' },
  { key: 'P1', n: 5, model: 'opus', kind: 'persona', title: 'Solo residential principal, 6 live projects (Leah-like)' },
  { key: 'P2', n: 6, model: 'sonnet', kind: 'persona', title: 'Principal of a three-person studio' },
  { key: 'P3', n: 7, model: 'sonnet', kind: 'persona', title: 'Junior designer, week one' },
  { key: 'P4', n: 8, model: 'sonnet', kind: 'persona', title: 'FF&E / procurement-heavy designer' },
]

const seatPrompt = (s) => `${PROGRAM}

${EVIDENCE}

YOUR SEAT: ${s.key} — ${s.title} (${s.kind === 'lens' ? 'UX/UI team' : 'Interior Design team'}). Your brief is the '${s.key}' entry in ${OUT}/source/instruments.md ${s.kind === 'lens' ? '§3 — answer every numbered question in it, naming the heuristic on each finding' : '§2 — become that person; follow the "How to walk" block exactly: for EVERY task T1–T16 write First glance / Where I\'d click / Where I\'d hesitate / Where I\'d give up / Obviousness (what-to-do and how-to-get-there scored separately), in the first person, present tense, quoting labels verbatim; complete your Special assignment if your entry has one'}. ${s.key === 'U4' ? 'Load the brand voice skill at ' + REPO + '/.claude/skills/patina-brand-voice/SKILL.md before proposing any label.' : ''} ${s.key === 'P1' ? 'Also walk T1 a second time as "back after ten days away" and record the difference.' : ''} ${s.key === 'P3' ? 'Your label list (every label you cannot define from the label alone, with what you thought it meant) is mandatory and goes in its own section of the report.' : ''}

Walk ALL sixteen tasks in order against BOTH baselines: today's paper (w1440/w1280/m390 shots, flag off) and the Worktable (wt- shots, flag on) — note where the Worktable changes your answer. Cover all three width tiers.

DELIVER ${OUT}/research/2${s.n}-panel-${s.key.toLowerCase()}.md with: (1) 'Overall' — ≤120 words; (2) the task table (T1–T16 × what-to-do 1–5 × how-to-get-there 1–5 × one-line note)${s.kind === 'persona' ? ' preceded by the full first-person walk transcript' : ''}; (3) findings — every one in the §4 schema shape, ids ${s.key}-01…; (4) ${s.kind === 'lens' ? 'answers to your numbered brief questions' : 'your special assignment section'}; (5) 'What stays true' — 3–6 things that already work and must not be broken. Then return the structured output. Aim for completeness: 12–30 findings is normal for this surface; a finding with no task id is out of scope — drop it.`

phase('Panel')
const panel = (await parallel(SEATS.map(s => () =>
  agent(seatPrompt(s), { label: `panel:${s.key}`, phase: 'Panel', model: s.model, effort: s.model === 'opus' ? 'high' : 'medium', schema: FINDING_SCHEMA })
    .then(r => r ? { seat: s.key, ...r } : null)
))).filter(Boolean)
log(`Panel returned ${panel.length}/9 seats; missing: ${SEATS.map(s => s.key).filter(k => !panel.some(p => p.seat === k)).join(', ') || 'none'}`)

phase('Collate')
const SEV = { blocker: 4, high: 3, medium: 2, low: 1 }
const rawCount = panel.reduce((n, p) => n + p.findings.length, 0)
const index = panel.flatMap(p => p.findings.map(f => ({ seat: p.seat, id: f.id, title: f.title, severity: f.severity, width: f.width, flag: f.flag, task_ids: f.task_ids, surface: f.surface })))
log(`Panel: ${rawCount} raw findings across ${panel.length} seats`)

const COLLATE_SCHEMA = { type: 'object', properties: {
  json_path: { type: 'string' }, md_path: { type: 'string' }, count: { type: 'number' },
  index: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string' }, width: { type: 'string' }, flag: { type: 'string' },
    seats: { type: 'array', items: { type: 'string' } }, task_ids: { type: 'array', items: { type: 'string' } }, already_ruled: { type: 'string' } },
    required: ['id', 'title', 'severity', 'width', 'flag', 'seats', 'task_ids', 'already_ruled'] } },
  worst_tasks: { type: 'array', items: { type: 'string' } },
}, required: ['json_path', 'md_path', 'count', 'index', 'worst_tasks'] }

const collated = await agent(`${PROGRAM}

YOUR ROLE: COLLATOR (Opus). Nine panel seats wrote their findings (in the §4 schema shape) into ${OUT}/research/20-panel-u1.md … 28-panel-p4.md (${rawCount} findings total; the index of ids/titles is below). Read all nine reports from disk. Produce the SEMANTIC collation: merge findings that describe the same defect on the same surface (different wording, different slugs) into one canonical finding; keep every contributing seat in 'seats' and every original id in 'merged_from'; take the MAX severity and MAX confidence; union the task_ids; keep the clearest verbatim observation; keep up to 3 evidence shots and 3 evidence refs; keep the best one-line suggested_fix. Do NOT merge across width tiers or flag states unless the contributors said 'all'/'both'. Do NOT drop anything — a single-seat finding stays as its own row. Do NOT add findings of your own. Assign ids F01… ordered by (seats desc, severity desc). Preserve 'already_ruled' when any contributor set one.

OUTPUT SIZE DISCIPLINE (a prior attempt exceeded the output limit): every field is capped — observation ≤300 chars, suggested_fix ≤160 chars, title ≤80 chars, evidence arrays ≤3 items. Write the JSON array to ${OUT}/research/30-collated-findings.json in TWO or more append chunks via bash heredocs (cat >> file <<'EOF'), never one giant write; fields per row exactly: id, title, task_ids, surface, width, flag, observation, why_it_blocks, evidence_shots, evidence_refs, severity, confidence, already_ruled, seats, merged_from, suggested_fix. Validate with python3 -c "import json;print(len(json.load(open('${OUT}/research/30-collated-findings.json'))))" and fix if it does not parse. Then write ${OUT}/research/30-collated-findings.md: a table id · title · seats · severity · confidence · width · flag · tasks · already_ruled; then the per-task obviousness table (mean what-to-do and mean how-to-get-there per T1–T16 across the nine seats' task tables — they are in each report) with the 5 worst tasks called out; then a merge log (one line per merge: canonical id ← original ids, why).

Return ONLY the compact index (id/title/severity/width/flag/seats/task_ids/already_ruled per canonical finding), the count, the two paths, and the 5 worst task ids — not the full rows.

INDEX OF RAW FINDINGS (seat, id, title, severity, width, flag, tasks, surface):
${JSON.stringify(index)}`,
  { label: 'collator (disk-based)', phase: 'Collate', model: 'opus', effort: 'high', schema: COLLATE_SCHEMA })
if (!collated || !collated.index.length) { log('Collation failed or empty — stopping'); return { gate: 'FAIL', reason: 'collate', panel: panel.map(p => p.report_path) } }
log(`Collated: ${collated.count} canonical findings (${collated.index.filter(f => f.seats.length >= 3).length} corroborated by 3+ seats); worst tasks ${collated.worst_tasks.join(', ')}`)
const COMPACT = JSON.stringify(collated.index)

phase('Verify')
const STEWARD_SCHEMA = { type: 'object', properties: { summary: { type: 'string' }, server: { type: 'string' }, ready: { type: 'boolean' } }, required: ['summary', 'server', 'ready'] }
const steward = (mode) => `${PROGRAM}

YOUR ROLE: dev-server STEWARD (Sonnet), mode ${mode}. Read ${OUT}/research/02-steward-boot-off.md for the exact recipe that worked (unsandboxed pnpm dev:designer with NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live and NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true', flag-off). Boot/kill commands run with dangerouslyDisableSandbox: true because the sandboxed attempt hit a .env deny rule and an EMFILE fd cap (documented in research/00-env-and-seeds.md); everything else stays sandboxed.
${mode === 'BOOT' ? `Check ports 3000/3014/3015/3016 (one port per lsof -i call); kill leftovers unsandboxed; boot exactly per the recipe with log ${OUT}/research/dev-w2-boot.log; poll curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/desk every 15 s up to 8 min for 200/307; curl /auth/signin once (real compile). LEAVE IT RUNNING and confirm the PIDs survive (sleep 5; lsof -i :3000). ready=true only if /desk answered.` : `Kill unsandboxed: pkill -f 'next dev'; pkill -f 'turbo run dev'; pkill -f 'nest start'; then per port 3000 3014 3015 3016: lsof -ti :<port> | xargs kill (kill -9 after 5 s if needed); confirm all four free. ready=false.`}
Write ${OUT}/research/32-steward-w2-${mode.toLowerCase()}.md (commands, PIDs, timings).`

const REFUTE_SCHEMA = { type: 'object', properties: {
  lens: { type: 'string' }, report_path: { type: 'string' }, json_path: { type: 'string' },
  verdicts: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, verdict: { type: 'string' }, note: { type: 'string', description: '≤160 chars' } },
    required: ['id', 'verdict', 'note'] } },
}, required: ['lens', 'report_path', 'json_path', 'verdicts'] }

const REFUTE_COMMON = `The canonical findings are on disk at ${OUT}/research/30-collated-findings.json (${collated.count} rows; fields id/title/task_ids/surface/width/flag/observation/why_it_blocks/evidence_shots/evidence_refs/severity/confidence/already_ruled/seats/merged_from/suggested_fix). Read that file. The compact index is: ${COMPACT}
OUTPUT DISCIPLINE: write your full per-finding entries to your report_path (markdown) AND a JSON array to your json_path with rows {id, verdict, reason (≤300 chars), evidence (≤200 chars), revised_claim (≤300 chars)}; return only {id, verdict, note ≤160 chars} per finding. Every id must get a verdict.`

const V1 = `${PROGRAM}

YOUR ROLE: V1 verify:code-truth (Opus). Try to KILL each finding by reading the actual component/derivation it concerns. Verdict per finding: 'stands' (the code does what the finding says — cite file:line), 'narrows' (true but overstated — give the narrower claim), or 'misread' (the affordance/behavior exists or works as intended and the seat simply did not find it — cite file:line proving it). Read ${OUT}/research/10-code-anatomy.md first (§6/§7 are your map), then sources under ${REPO}/apps/designer-portal/src/{app/(document),components/document,lib/document} as needed. ${REFUTE_COMMON} report_path ${OUT}/research/33-verify-code-truth.md; json_path ${OUT}/research/33-verify-code-truth.json. Deliver exactly this; no unrequested extras.`

const V2 = `${PROGRAM}

YOUR ROLE: V2 verify:canon-truth (Sonnet). For each finding decide whether it describes a BUG/GAP or a RULED BEHAVIOR. Read ${OUT}/research/11-canon-digest.md (A)(B)(E) and ${OUT}/source/instruments.md §5; grep ${REPO}/docs/design/the-document/DECISIONS.md (9,431 lines — grep -n / sed -n ranges only, never whole) to confirm. Verdict per finding: 'open' (not ruled — fair game for both directions), 'ruled-against:<id>' (the behavior is a ruling; the finding remains valid but Direction A may not touch it and Direction B must name the amendment — quote the clause ≤25 words in reason), 'known-open:<id>' (already logged as open, e.g. I114, T4/T2, Knowledge), or 'misread' (the finding misdescribes what the ruling says — explain). ${REFUTE_COMMON} report_path ${OUT}/research/34-verify-canon-truth.md; json_path ${OUT}/research/34-verify-canon-truth.json.`

const V3 = (st) => `${PROGRAM}

YOUR ROLE: V3 verify:repro (Sonnet). The portal is RUNNING at http://localhost:3000, flag OFF (steward: ${st.server}); do not start/stop it. Reproduce each finding live with a Playwright script (headless chromium; login helper: port apps/designer-portal/e2e/fixtures/auth.ts — designer@patina.dev / password123; init script e2e/helpers/hide-dev-overlays.ts; write your script under ${OUT}/probe/, NOT under apps/). Re-derive live document ids via psql (postgresql://postgres:postgres@127.0.0.1:54322/postgres) from the document_state view for designer a0000000-0000-0000-0000-000000000004 (Chen Residence live id 2992a486-b2bd-4139-9e51-33ed1621c59c; others in ${OUT}/research/state-ladder.json may have drifted — check). Verdict per finding: 'reproduced' (you saw it; save ${OUT}/probe/repro-<id>.png), 'not-reproduced' (you looked at the exact surface/width and the claimed problem is not there — say what IS there), 'state-dependent' (needs data/state you could not create — say what), or 'flag-on-unverified' for flag='on' findings (judge from the wt- screenshots: say 'screenshot-consistent' or 'screenshot-inconsistent' in reason). Set the viewport to the finding's width (1440×900 / 1280×900 / 390×844 mobile). Batch findings by surface+width so each page load serves many checks. ${REFUTE_COMMON} report_path ${OUT}/probe/35-verify-repro.md; json_path ${OUT}/probe/35-verify-repro.json.`

const st = await agent(steward('BOOT'), { label: 'steward boot (for repro)', phase: 'Verify', model: 'sonnet', effort: 'low', schema: STEWARD_SCHEMA })
const [v1, v2, v3] = await parallel([
  () => agent(V1, { label: 'V1 code-truth', phase: 'Verify', model: 'opus', effort: 'high', schema: REFUTE_SCHEMA }),
  () => agent(V2, { label: 'V2 canon-truth', phase: 'Verify', model: 'sonnet', effort: 'medium', schema: REFUTE_SCHEMA }),
  () => (st && st.ready) ? agent(V3(st), { label: 'V3 live repro', phase: 'Verify', model: 'sonnet', effort: 'high', schema: REFUTE_SCHEMA }) : Promise.resolve(null),
])
const kill = await agent(steward('KILL'), { label: 'steward kill', phase: 'Verify', model: 'sonnet', effort: 'low', schema: STEWARD_SCHEMA })

const vmap = (v) => new Map((v?.verdicts || []).map(x => [x.id, x]))
const m1 = vmap(v1), m2 = vmap(v2), m3 = vmap(v3)
const survival = collated.index.map(f => {
  const a = m1.get(f.id), b = m2.get(f.id), c = m3.get(f.id)
  const survives = !(a && a.verdict === 'misread') && !(b && b.verdict === 'misread') && !(c && c.verdict === 'not-reproduced')
  return { id: f.id, survives, code_truth: a ? a.verdict : 'unverified', canon_truth: b ? b.verdict : 'unverified', repro: c ? c.verdict : 'unverified' }
})
const survivors = survival.filter(s => s.survives)
log(`Survival: ${survivors.length}/${survival.length} stand (killed by code ${survival.filter(s => s.code_truth === 'misread').length}, canon-misread ${survival.filter(s => s.canon_truth === 'misread').length}, repro ${survival.filter(s => s.repro === 'not-reproduced').length}; ruled-against ${survival.filter(s => String(s.canon_truth).startsWith('ruled-against')).length}; known-open ${survival.filter(s => String(s.canon_truth).startsWith('known-open')).length})`)

const SCRIBE_SCHEMA = { type: 'object', properties: { json_path: { type: 'string' }, md_path: { type: 'string' }, surviving: { type: 'number' }, total: { type: 'number' } }, required: ['json_path', 'md_path', 'surviving', 'total'] }
const scribe = await agent(`${PROGRAM}

YOUR ROLE: SCRIBE (Sonnet). Merge on disk with a python3 script (write it to ${OUT}/research/merge-verdicts.py and run it): load ${OUT}/research/30-collated-findings.json; load the three verdict files ${OUT}/research/33-verify-code-truth.json, ${OUT}/research/34-verify-canon-truth.json, ${OUT}/probe/35-verify-repro.json (each an array of {id, verdict, reason, evidence, revised_claim}; a missing file = all 'unverified'). For each finding add: code_truth, code_note (revised_claim or reason), canon_truth, canon_note, repro, repro_note, claim (= revised_claim from code-truth when its verdict is 'narrows' and non-empty, else the observation), survives (= code_truth != 'misread' and canon_truth != 'misread' and repro != 'not-reproduced'). Write ${OUT}/research/31-verified-findings.json (ALL rows, survives true/false). Then render ${OUT}/research/31-verified-findings.md: header (total, surviving, killed by each refuter, count ruled-against, count known-open); table of SURVIVING findings ordered by (len(seats) desc, severity desc): id · title · seats · severity · confidence · width · flag · tasks · canon_truth · repro · claim; then 'Killed' table: id · title · killer · note. Print the counts. The orchestrator's own survival tally for cross-check: ${JSON.stringify(survival)}. Return the paths and counts.`, { label: 'scribe 31-verified', phase: 'Verify', model: 'sonnet', effort: 'low', schema: SCRIBE_SCHEMA })

return {
  gate: survivors.length > 0 ? 'pass' : 'FAIL',
  panel: panel.map(p => ({ seat: p.seat, report: p.report_path, findings: p.findings.length, overall: p.overall })),
  raw: rawCount, collated: collated.count, surviving: survivors.length, worst_tasks: collated.worst_tasks,
  refuters: { v1: v1?.report_path, v2: v2?.report_path, v3: v3?.report_path || 'not run' },
  verified_json: scribe?.json_path, verified_md: scribe?.md_path, steward: { boot: st?.server, kill: kill?.summary },
}
