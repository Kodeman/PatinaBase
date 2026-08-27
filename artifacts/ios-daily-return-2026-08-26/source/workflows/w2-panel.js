export const meta = {
  name: 'ios-daily-return-w2-panel',
  description: 'Nine-seat panel (3 homeowners, 3 interior designers, 3 UX/UI lenses) reviews the Patina iOS client app on the evidence; collate on disk; three refuters; merge',
  phases: [
    { title: 'Panel', detail: 'H1–H3 · D1–D3 · U1–U3 walk T1–T14 on the shots + anatomy' },
    { title: 'Collate', detail: 'merge nine finding sets by key on disk → F-ids' },
    { title: 'Verify', detail: 'code-truth · canon-truth · repro on the booted simulator' },
    { title: 'Merge', detail: 'verified findings + themes' },
  ],
}

const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const R = `${OUT}/research`
const INSTR = `${OUT}/source/instruments.md`
const UDID = '973D1724-90BF-4A0A-B02D-481D561547B3'

const COMMON = `You are one agent in an autonomous multi-agent review program ("The Daily Return") of the Patina iOS CLIENT app (apps/mobile/Patina). The orchestrator reads only your structured return and your files on disk.
Ground rules:
- Output root: ${OUT}. Write your deliverables where the brief says. Never write to the session scratchpad.
- Do NOT run git commit/add/stash/checkout. Do NOT edit any app source. Do NOT mutate production.
- Evidence first: every finding cites a shot filename from ${OUT}/shots (Read the PNG — it renders as an image) and/or a repo-relative file:line. Quote on-screen labels verbatim.
- Read ${INSTR} §0 first. Then only the sections your brief names.
- Walk evidence: ${R}/01-shot-ledger.md (every shot, with what is time-aware on each screen) and ${R}/03-walk-observations.md (the walkers' observations and what could not be captured — read it in full before your tasks; it names the shipped defects the shots show, e.g. the product-detail trap, the browse-grid geometry, the room unit conversion, the "SIGNED" mislabel, the designer named once).
- Grounding files (read the ones your brief names): ${R}/10-code-anatomy.md · ${R}/15-task-paths.md · ${R}/16-token-table.md · ${R}/11-canon-digest.md · ${R}/12-backend-reality.md · ${R}/14-grounding-gaps.md · ${R}/17-gap-fills.md · ${R}/01-shot-ledger.md (the index of every screenshot) · ${R}/02-steward-boot.md (simulator recipe; §8 lists known-bad LOCAL environment behaviour that must never be reported as an app defect).
- Standing facts every seat must hold (instruments §6b, C23–C29): the shipped home is Option B's "Today" (four modules; the July marketplace rail is orphaned, not ruled over — read ${ROOT}/apps/mobile/Patina/OPTION_B_ACCEPTANCE.md); direct orders exist on the backend with no iOS client and no designer attribution; Apple Pay is already inside the hosted Checkout; push send is real but fires for nothing money-shaped; local OTP mail has no code (password sign-in was used) — not an app finding.
- Your FINAL action must be the StructuredOutput tool call, even if steps failed — report failures inside it. Return only the compact index the schema asks for; never paste findings into the return.`

const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }

const SEAT = {
  type: 'object', required: ['report_file', 'findings_file', 'n_findings', 'top'],
  properties: {
    report_file: { type: 'string' }, findings_file: { type: 'string' }, n_findings: { type: 'number' },
    top: { type: 'array', items: { type: 'object', required: ['id', 'title', 'severity'], properties: { id: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string' } } } },
    would_return_tomorrow: { type: 'string', description: 'one sentence: yes/no and the reason (homeowners); "would send clients" (designers); the retention verdict (lenses)' },
    failures: { type: 'array', items: { type: 'string' } },
  },
}

const seatBrief = (id, kind, model, sectionRef, tasks, extra) => `${COMMON}

ROLE: seat ${id} — ${kind}. Read instruments §0, §1 (the task script), ${sectionRef} (YOUR persona/lens — stay in it, first person, present tense), §5 (finding schema), §6 (canon guard — a finding that touches a ruled item is still a finding; set already_ruled). Read instruments §6b (post-grounding corrections C23–C29), the anatomy (10), the task paths (15), the canon digest sections 2, 3 and 6 (residual follow-ups, glossary, corrected canon guard), the gap fills (17), the Option B acceptance contract, and the backend sections your tasks touch. Then read the shot ledger and LOOK at the shots for every task you run (Read each PNG). Where the ledger reports a screen unreachable in the Simulator (scan/AR/LiDAR), reason from the anatomy and mark the finding confidence ≤0.6 with "what would settle this".
Run these tasks: ${tasks}. For each task write the walk block exactly in the persona format, then the findings it produced.
${extra}
Deliver two files:
1. ${R}/2x-panel-${id.toLowerCase()}.md — the walk narrative (one block per task, in order), then the closing lines your persona/lens section asks for, then a findings table (id · title · severity · confidence · shots).
2. ${R}/2x-panel-${id.toLowerCase()}.json — a JSON array of findings in the §5 schema, ids "${id}-01"… . Write it in ≤40-finding chunks (append) if long; validate it parses (python3 -c "import json;json.load(open(...))").
Standards: a finding is one problem on one surface with one piece of evidence; ≤10-word title; observation verbatim; why_it_matters ties to return or purchase; proposal_seed is one move, not a feature list. Report EVERY finding you see with its own severity and confidence — do not filter to "important" ones; the orchestrator filters at synthesis. Do not re-report a July item marked DELIVERED-VERIFIED unless a shot shows it regressed (then set july_status). Aim for 12–30 findings; more is fine if each is real.`

phase('Panel')
const HOMEOWNER_EXTRA = `Answer the return probe (T2) and re-entry probe (T11) with special care: say exactly what on the first screen is or is not new since yesterday, and what would have to be there. Answer T7 (Buy it) by naming the dead end verbatim and how many taps you spent looking. Close with "Three things that would make me open this every day" and "What would make me buy here instead of the maker's own site".`
const DESIGNER_EXTRA = `You know the designer portal (The Document). Judge the client app as its other half: what my client sees of me, what my client can do that saves me an email, what competes with me. Answer T14 in full. Close with "What I want my client doing here" and "What would make me stop sending clients here".`

const seats = [
  { id: 'H1', kind: 'homeowner — Maya & Devon, Grand Rapids (Opus)', model: 'opus', ref: '§2 H1', tasks: 'T1–T14, all fourteen', extra: HOMEOWNER_EXTRA },
  { id: 'H2', kind: 'homeowner — Ruth, Des Moines, activeProject tier (Sonnet)', model: 'sonnet', ref: '§2 H2', tasks: 'T1–T14, all fourteen — you are SIGNED IN with a designer engaged; use the c- shots as your home', extra: HOMEOWNER_EXTRA },
  { id: 'H3', kind: 'homeowner — Walt, Madison (Opus)', model: 'opus', ref: '§2 H3', tasks: 'T1–T14, all fourteen', extra: HOMEOWNER_EXTRA },
  { id: 'D1', kind: 'interior designer — Leah, Columbus (Opus)', model: 'opus', ref: '§3 D1', tasks: 'T1, T2, T6, T7, T8, T9, T10, T14', extra: DESIGNER_EXTRA },
  { id: 'D2', kind: 'interior designer — Priya, Minneapolis (Sonnet)', model: 'sonnet', ref: '§3 D2', tasks: 'T1, T2, T8, T9, T10, T12, T14', extra: DESIGNER_EXTRA },
  { id: 'D3', kind: 'interior designer — Tom, Milwaukee (Sonnet)', model: 'sonnet', ref: '§3 D3', tasks: 'T3, T6, T7, T8, T14', extra: DESIGNER_EXTRA },
  { id: 'U1', kind: 'UX lens — retention & habit design (Opus)', model: 'opus', ref: '§4 U1', tasks: 'T1, T2, T4, T8, T10, T11, T12 plus the seven U1 questions', extra: 'Deliver the U1 questions as a section of your report: the trigger inventory, the remembered investment, the variable reward, the day-1/2/7/30 curve as built today, the per-tier honest reason to return, the unused iOS return surfaces, and the ranked ten return mechanics (honesty × plausibility × cost) — each mechanic in one line with the finding ids it answers. Name every idea you reject as manipulative and why.' },
  { id: 'U2', kind: 'UX lens — interaction, navigation & visual (Sonnet)', model: 'sonnet', ref: '§4 U2', tasks: 'T1, T3, T4, T5, T13 plus the seven U2 questions; read the d- and x- shots for T13', extra: 'Deliver the reachability graph of the home per tier as a table (door → destination → acts), the tappable-but-isn\'t / isn\'t-but-looks list, and the dark/XL defects with shot names.' },
  { id: 'U3', kind: 'UX lens — commerce (Opus)', model: 'opus', ref: '§4 U3', tasks: 'T3, T4, T6, T7, T8, T10 plus the seven U3 questions; read backend sections 1, 4, 5, 12', extra: 'Deliver the U3 questions as a section: the purchase dead end verbatim; the trust-field table (exists in products? shown on detail?); the three purchase paths by tier with the Apple rule stated; the minimum order state machine and where it lives; Walt\'s pre-payment checklist; post-purchase return loops; the Apple Pay cost table (hosted Checkout vs PaymentSheet vs through-designer).' },
]

const seatResults = await parallel(seats.map(s => () => safe(s.id, agent(seatBrief(s.id, s.kind, s.model, s.ref, s.tasks, s.extra), { label: `seat ${s.id}`, phase: 'Panel', model: s.model, effort: s.model === 'opus' ? 'high' : undefined, schema: SEAT }))))
const seatIndex = seats.map((s, i) => ({ id: s.id, ok: !!seatResults[i], n: seatResults[i] ? seatResults[i].n_findings : 0, verdict: seatResults[i] ? seatResults[i].would_return_tomorrow : null }))
log(`Panel: ${seatIndex.map(s => `${s.id}:${s.ok ? s.n : 'NULL'}`).join(' ')}`)

phase('Collate')
const COLLATE = {
  type: 'object', required: ['json_file', 'md_file', 'n_raw', 'n_canonical', 'index'],
  properties: {
    json_file: { type: 'string' }, md_file: { type: 'string' }, n_raw: { type: 'number' }, n_canonical: { type: 'number' },
    index: { type: 'array', items: { type: 'object', required: ['id', 'title', 'severity', 'seats'], properties: { id: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string' }, seats: { type: 'array', items: { type: 'string' } }, class: { type: 'string' } } } },
    failures: { type: 'array', items: { type: 'string' } },
  },
}
const collate = await safe('collate', agent(`${COMMON}

ROLE: collator. Read instruments §5 only. Merge the nine seat finding files ${R}/2x-panel-{h1,h2,h3,d1,d2,d3,u1,u2,u3}.json (skip any missing; list it as a failure) into canonical findings.
Method — on disk, with a Python script you write to ${OUT}/source/workflows/collate.py: load all arrays; group by exact key; then a second pass merging findings whose surface+class match and whose titles/observations describe the same problem (be conservative — when unsure keep separate, but record "related" ids); each canonical finding keeps: id F01… (ordered by severity S0→S3 then by number of seats), title (best of the group), seats[], source_ids[], task_ids (union), key, surface, tier, class, observation (best verbatim), why_it_matters (best), evidence (union of shots/refs), severity (max), confidence (mean), already_ruled (any), july_status (any), proposal_seeds[] (all distinct), related[]. Write ${R}/30-collated-findings.json (the full array) and ${R}/30-collated-findings.md (a table: id · title · severity · confidence · seats · class · shots). Return ONLY the compact index (id, title, severity, seats, class) — never the full objects.`, { label: 'collate', phase: 'Collate', model: 'sonnet', schema: COLLATE }))
log(`Collate: ${collate ? `${collate.n_raw} raw → ${collate.n_canonical} canonical` : 'NULL'}`)
if (!collate) return { seats: seatIndex, collate: null }

phase('Verify')
const VERDICTS = {
  type: 'object', required: ['file', 'n_checked', 'n_confirmed', 'n_refuted', 'n_adjusted', 'n_unable'],
  properties: { file: { type: 'string' }, n_checked: { type: 'number' }, n_confirmed: { type: 'number' }, n_refuted: { type: 'number' }, n_adjusted: { type: 'number' }, n_unable: { type: 'number' }, refuted_ids: { type: 'array', items: { type: 'string' } }, notes: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } },
}
const VERIFY_COMMON = `Read ${R}/30-collated-findings.json from disk (never ask for it inline). For every finding write a verdict object {id, verdict: "confirmed|refuted|adjusted|unable", note, corrected_refs?, corrected_severity?, corrected_observation?} into your output file as a JSON array, in chunks if long; validate it parses. Default to refuted when the evidence does not support the claim — a plausible-but-wrong finding must not reach the authors.`
const [v1, v2, v3] = await parallel([
  () => safe('R1', agent(`${COMMON}

ROLE: refuter R1 — code truth. ${VERIFY_COMMON} Standing verification you must do first and record in your notes: (a) does main's migration set give products TWO foreign keys to vendors (grep supabase/migrations for REFERENCES vendors / retailer_id / vendor_id) so the product-detail PGRST201 trap is a shipped bug rather than a local artifact; (b) does the manual room entry really convert feet as meters (Features/Rooms/Views/ManualRoomEntryView.swift and its model); (c) is "SIGNED" applied to status accepted in the proposals list (Features/Proposals). For each finding, check every code claim and every ref against the repo (Serena symbolic tools scoped to apps/mobile/Patina, or grep + targeted reads): does the cited file:line say what the finding says; is the behaviour claimed actually what the code does (data source, refresh, what changes day to day, what acts exist); is a "missing" thing truly absent (grep app-wide before agreeing). Correct refs. Output ${R}/33-verify-code-truth.json.`, { label: 'R1 code-truth', phase: 'Verify', model: 'opus', effort: 'high', schema: VERDICTS })),
  () => safe('R2', agent(`${COMMON}

ROLE: refuter R2 — canon truth. ${VERIFY_COMMON} Read instruments §6 and ${R}/11-canon-digest.md fully. For each finding: (a) is it a re-report of a July U# marked DELIVERED-VERIFIED / DELIVERED-CODE with no regression evidence → refuted with the U# (a residual follow-up the DELIVERY names is NOT a re-report — confirm it and cite the row); (b) does it touch a ruled item → adjusted with already_ruled = R#/C# (still valid, Lane A cannot spend it); (c) does its proposal_seed violate the brand voice or the honesty rows → note it; (d) does it contradict the digest's facts → refuted. Output ${R}/34-verify-canon-truth.json.`, { label: 'R2 canon-truth', phase: 'Verify', model: 'sonnet', schema: VERDICTS })),
  () => safe('R3', agent(`${COMMON}

ROLE: refuter R3 — repro on the booted simulator (udid ${UDID}). ${VERIFY_COMMON} Read ${R}/02-steward-boot.md fully (tap/type/shot recipe; xcrun simctl / osascript must run with dangerouslyDisableSandbox: true). Take the findings in severity order S0 → S1 → S2 and try to reproduce each claim that is observable in the Simulator (skip scan/AR/LiDAR claims → "unable"): reach the surface, do the act, and capture a probe shot into ${OUT}/probe/<Fid>-<slug>.png (create the dir). Stop after 40 findings or when the remaining ones are S3. For each: reproduced → confirmed (with probe shot), not reproduced → refuted (with the shot showing the actual behaviour), could not reach → unable (why). Never sign out of the client account unless a finding requires the guest state — if you must, sign back in at the end using the recipe. Output ${R}/35-verify-repro.json.`, { label: 'R3 repro', phase: 'Verify', model: 'opus', effort: 'high', schema: VERDICTS })),
])
log(`Verify: R1 ${v1 ? `${v1.n_confirmed}✓ ${v1.n_refuted}✗ ${v1.n_adjusted}~` : 'NULL'} · R2 ${v2 ? `${v2.n_confirmed}✓ ${v2.n_refuted}✗ ${v2.n_adjusted}~` : 'NULL'} · R3 ${v3 ? `${v3.n_confirmed}✓ ${v3.n_refuted}✗ ${v3.n_unable}?` : 'NULL'}`)

phase('Merge')
const MERGE = {
  type: 'object', required: ['json_file', 'md_file', 'themes_file', 'n_verified', 'n_refuted', 'top'],
  properties: {
    json_file: { type: 'string' }, md_file: { type: 'string' }, themes_file: { type: 'string' }, n_verified: { type: 'number' }, n_refuted: { type: 'number' }, n_unverified: { type: 'number' },
    by_class: { type: 'object', additionalProperties: { type: 'number' } },
    top: { type: 'array', items: { type: 'object', required: ['id', 'title', 'severity', 'class'], properties: { id: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string' }, class: { type: 'string' }, seats: { type: 'array', items: { type: 'string' } } } } },
    failures: { type: 'array', items: { type: 'string' } },
  },
}
const merged = await safe('merge', agent(`${COMMON}

ROLE: scribe. With a Python script (${OUT}/source/workflows/merge.py) merge ${R}/30-collated-findings.json with the three verdict files ${R}/33-verify-code-truth.json, ${R}/34-verify-canon-truth.json, ${R}/35-verify-repro.json (skip a missing file; note it). Rules: a finding is REFUTED if any refuter refuted it and no other confirmed it with contrary evidence (when refuters disagree, keep it as "contested" with both notes and lower confidence by 0.2); apply corrected_refs / corrected_severity / corrected_observation; status = verified (≥1 confirmed, 0 refuted) · contested · unverified (only "unable"/absent verdicts) · refuted. Write ${R}/31-verified-findings.json (verified + contested + unverified, with a status field and the verdict notes) and ${R}/31-verified-findings.md (table), plus ${R}/32-refuted-findings.md (what was dropped and why — the authors must see this too). Then write ${R}/36-findings-by-theme.md: group by class (return · purchase · trust · wayfinding · content · reach), counts, and for each class the findings in severity order with one-line summaries; end with "The twelve that matter most" chosen by severity × seats × confidence, with the seat quotes (verbatim from the panel reports) that best voice each. Return the compact index only.`, { label: 'merge', phase: 'Merge', model: 'sonnet', schema: MERGE }))
log(`Merge: ${merged ? `${merged.n_verified} verified, ${merged.n_refuted} refuted` : 'NULL'}`)

return { seats: seatIndex, collate: collate && { n_raw: collate.n_raw, n_canonical: collate.n_canonical }, verify: { r1: v1, r2: v2, r3: v3 }, merged }
