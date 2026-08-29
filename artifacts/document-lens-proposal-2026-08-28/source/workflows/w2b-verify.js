export const meta = {
  name: 'document-lens-w2b-verify',
  description: 'W2b: boot the portal, then three refuters attack the collated findings (code truth, live repro, canon context), kill the server, and a scribe merges the verdicts into 31-verified-findings',
  phases: [
    { title: 'Boot', detail: 'steward checks port 3000 and boots the designer portal if nothing answers' },
    { title: 'Refute', detail: 'V1 code-truth, V2 live repro at the finding width and scroll state, V3 canon context — in parallel' },
    { title: 'Kill', detail: 'steward kills the dev server and frees ports 3000/3014/3015/3016' },
    { title: 'Scribe', detail: 'merge-verdicts.py joins the three verdict files into 31-verified-findings.{json,md}' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const OUT = REPO + '/artifacts/document-lens-proposal-2026-08-28'

const ASK = "> \"We are getting close to a design that feels right on the document. The spine on the left is still cluttered and could be better utilized to navigate the ins and outs of the document. The main header contains great info but takes up most of the screen height when opened up, each section is crammed into the next and the margin seems cramped for the space needed for the functionality it contains. Have a team of UI and UX designers sit down with the Patina engineering and interior design teams. Work with them to design the document so that it contains the needed information and actions, while feeling uncluttered and peaceful. Explore animations, content that appears when it needs to and lends to space when it isn't needed in frame. Think of the document as a smart lens that is always adjusting focus on what is needed as the designers move through the document. Present your strongest proposal to achieve this in an html document accompanied with a high fidelity mockup showcasing how the team will accomplish this challenging User experience and UI requirements.\"\n\nThe unit of analysis for every seat in this program is **four scroll states x three widths**: `s0 top` (scrollY 0) · `s1 seam` (the letterhead just gone, the ticket pinned as its two-line seam) · `s2 mid` (the FF&E region head at the top of the frame, under the seam) · `s3 foot` (the Record and colophon in frame); at 1440x900, 1280x800 and 390x844. A finding without a scroll state is out of scope."
const S4_SCHEMA_SPEC = "## §4 Finding schema\n\n```json\n{ \"id\": \"U1-07\", \"lens\": \"U1\", \"persona\": null, \"task_ids\": [\"T3\",\"T4\"],\n  \"key\": \"doc|1440|s0|header-stack-eats-78pct\",\n  \"surface\": \"/doc/[id]\", \"width\": \"1440|1280|390|all\",\n  \"scroll_state\": \"top|seam|mid|foot|all\",\n  \"flag\": \"off|on|both\",\n  \"title\": \"Header stack leaves 12% of the frame for the work\",\n  \"observation\": \"verbatim what is on screen — labels quoted exactly\",\n  \"why_it_blocks\": \"clutter | crowding | orientation | information-loss | motion\",\n  \"frame_cost_estimate\": 700,\n  \"evidence\": { \"shots\": [\"w1440-rich-s0.png\"], \"refs\": [\"apps/designer-portal/src/components/document/job-ticket.tsx:362\"] },\n  \"severity\": \"blocker|high|medium|low\", \"confidence\": 0.9,\n  \"already_ruled\": null, \"suggested_fix\": \"one line, one move\",\n  \"hesitation_seconds_estimate\": 45 }\n```\n\nRules — the wayfinding rules stand, plus three fields new to this program:\n\n- exactly one of `lens` / `persona` non-null; no `task_ids` → drop; `title` <=10 words and states the problem; `observation` verbatim; `evidence` at least one of shots/refs.\n- `severity`: blocker = task impossible · high = only by luck or memory · medium = hesitation · low = polish. `confidence` < 0.5 must append \"what would settle this\".\n- `already_ruled` cites the DECISIONS id **for the record only** — under the canon latitude in §5 it is context, never a cost.\n- **`scroll_state` is required** and is one of `top` · `seam` · `mid` · `foot` · `all`. A finding without it is out of scope and the collator drops it.\n- **`why_it_blocks`** is one of `clutter` (too much on screen at once) · `crowding` (things too close to each other to read as separate) · `orientation` (she cannot say where she is or what she is in) · `information-loss` (something true is not on screen and cannot be got to) · `motion` (a movement misleads, jars, or cannot be stilled).\n- **`frame_cost_estimate`** is a number: the px of a 900px frame this defect consumes or wastes at the state named. At 390 normalise to the 844 frame and say so in `observation`. An estimate is fine; a missing number is not.\n- `key` = `surface|width|scroll_state|kebab-slug` so identical findings collide across seats. Two seats that find the same thing at the same offset must produce the same key."
const S5_CANON = "## §5 Canon latitude\n\n```\nCANON LATITUDE (2026-08-28, Kody): the ruling ledger docs/design/the-document/DECISIONS.md\n(last id R126) is CONTEXT, not constraint. Amend freely. Do NOT price amendments and do NOT\npenalise them — a refuter labels what a move amends, for the record only. Four hard no-gos\nstand and are not re-proposable:\n  NG1  D1 — one document at a time. No split view, no tabs, no peek/hold, no persistent\n       global nav over an open doc. Esc / Put down is the exit.\n  NG2  D4 shadow budget — exactly one token, --elevation-sheet: 0 1px 2px rgba(44,41,38,.08),\n       at three sites (margin chip, open ledger sheet, studio drawer). Zero other shadows.\n       Mockups, fragments and deck must show 0 box-shadow beyond that token (computed-style\n       sweep, not source grep).\n  NG3  The Thumb Index — removed by Kody, \"do not re-propose\".\n  NG4  The R126 ratified visual register is the FLOOR — 40px Playfair letterhead, 24px Playfair\n       region heads, five-step scale 40/24/18/15/14, mono 11px floor, three rule weights\n       (--rule-hair 1px 10% / --rule-mid 1.5px #2C2926 / --rule-strong 2px + hairline double),\n       paper #FCFAF6, rail stock #E8E3DB, desk #FAF7F2, charcoal #2C2926, the -ink text\n       companions (clay #7C5E30, terracotta #9C5340, golden-hour #79651E, sage #5F6B57), muted\n       ramp #4E4339/#5A4E43/#65594E, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal\n       word, -1.5deg), six saturated stage tab plates (--tab-brief #497093 … --tab-install\n       #823832, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms\n       in / 200ms out, --ease-editorial cubic-bezier(0.22,1,0.36,1), ~1.12:1 over own ground,\n       flat -still tint under reduced motion), 48px product crops on catalog-linked lines.\n       The proposal BUILDS ON this register; it does not restyle it. \"Typography goes no further\n       than the mockup\" (R126). THE STUDIO desk block is untouched.\nKody's taste on record: large tinted surfaces read as \"silly/terrible\"; colour belongs on small\nstate-carrying things; \"the sections and animated highlighting\" were loved; \"don't push the\ntypography further\".\nEverything else — composition, mount order, disclosure, motion, the spine's job, the header's\njob, spacing tokens, what appears when — is open ground.\n```"

const PROGRAM = `You are one agent in "The Document — The Smart Lens" (2026-08-28): a multi-agent design review of the Patina designer portal's document surface, /doc/[id]. Patina connects interior designers with makers of custom furnishings. Nothing in the product is changed by this program. Repo ${REPO}. You are in the REFUTATION wave: a panel of ten seats produced canonical findings, and your job is to attack them.

THE ASK (Kody, 2026-08-28) — verbatim, quoted in every brief:
${ASK}

HARD RULES
1. Durable path: write your deliverables to the exact absolute paths you are given under ${OUT}/. The orchestrator reads the FILES. Never write to /tmp or a scratchpad.
2. Forbidden: git add/commit/stash/push; editing anything under apps/, packages/, supabase/, docs/. Only the STEWARD may start or stop a dev server. You MAY write new files under ${OUT}/ only.
3. Every finding gets a verdict. Never skip one because it looks obviously right or obviously wrong, and never filter by perceived importance — the orchestrator filters.
4. Quote labels and code verbatim. A refutation without a file:line, a screenshot or a quoted clause is not a refutation.
5. Your final message IS the return value. Return ONLY the compact array the schema asks for — one row per finding, note <= 160 chars. The full rows go to your report path on disk.`

const FINDINGS_CONTRACT = `THE FINDINGS UNDER TEST are on disk at ${OUT}/research/30-collated-findings.json — a JSON array whose rows carry id, title, task_ids, key, surface, width, scroll_state, flag, observation, why_it_blocks, frame_cost_estimate, evidence_shots, evidence_refs, severity, confidence, already_ruled, seats, merged_from, suggested_fix. READ THAT FILE FIRST; it is the only input list, and every id in it must appear exactly once in your output.

SUPPORTING EVIDENCE (read what your verdict needs): ${OUT}/research/10-code-anatomy.md · ${OUT}/research/11-canon-digest.md · ${OUT}/research/12-layout-measurements.{md,json} · ${OUT}/research/01-shot-ledger.md · ${OUT}/probe/03-interactive-probe.md · ${OUT}/research/state-ladder.json · ${OUT}/shots/*.png.

OUTPUT DISCIPLINE: write the full per-finding rows to your markdown report path, AND a JSON array to your json path with rows {id, verdict, reason (<= 300 chars), evidence (<= 200 chars), revised_claim (<= 300 chars, empty string when the claim is unchanged)}. Return ONLY {id, verdict, note (<= 160 chars)} per finding — nothing else.`

const VERDICT_SCHEMA = { type: 'object', properties: {
  lens: { type: 'string' }, report_path: { type: 'string' }, json_path: { type: 'string' },
  verdicts: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, verdict: { type: 'string' }, note: { type: 'string', description: 'max 160 chars' } },
    required: ['id', 'verdict', 'note'] } },
}, required: ['lens', 'report_path', 'json_path', 'verdicts'] }

const STEWARD_SCHEMA = { type: 'object', properties: {
  summary: { type: 'string' }, ready: { type: 'boolean' }, pid: { type: 'string' }, killed: { type: 'boolean' } },
  required: ['summary', 'ready', 'pid', 'killed'] }

phase('Boot')
const boot = await agent(`${PROGRAM}

YOUR ROLE: dev-server STEWARD (boot). The refuters need the designer portal answering on http://localhost:3000.

1. Check first: lsof -i :3000 -t (one port per call). If a PID answers AND curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/desk returns 200 or 307, DO NOT boot anything — report ready=true with that pid and stop.
2. If nothing answers, boot exactly per the recipe in ${OUT}/research/02-steward-boot.md — read that file and follow it; it names the flag overrides, the data mode, the nohup line and the log path. Boot and poll commands run with dangerouslyDisableSandbox: true on the Bash tool (headless Chromium cannot claim a mach port inside the sandbox, and turbo's git-status scan trips the .env deny rule); everything else stays sandboxed.
3. Poll curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/desk every 15 seconds for up to 8 minutes, until 200 or 307; then curl /auth/signin once so it really compiles. LEAVE IT RUNNING — the refuters need it. Confirm the PIDs survive.
4. Append to ${OUT}/research/00-env-and-ids.md a dated section logging every command you ran verbatim, the PIDs, the poll timings and the final status codes.

ready=true only if /desk actually answered. Return {summary, ready, pid, killed:false}.`,
  { label: 'steward boot', phase: 'Boot', model: 'sonnet', effort: 'low', schema: STEWARD_SCHEMA })
log(`Steward boot: ready=${boot ? boot.ready : 'null'} pid=${boot ? boot.pid : '-'}`)

phase('Refute')
const V1 = `${PROGRAM}

YOUR ROLE: V1 verify:CODE-TRUTH (Opus). Try to KILL each finding by reading the component, hook or derivation it actually concerns. Read ${OUT}/research/10-code-anatomy.md first (it is your map), then the real sources under ${REPO}/apps/designer-portal/src/{app,components/document,lib/document,hooks} as each finding requires. Read the cited component before ruling; a verdict with no file:line is not a verdict.

VERDICT per finding, exactly one of:
- 'stands' — the code does what the finding says. Cite file:line.
- 'narrows' — true but overstated. Give the NARROWER claim in revised_claim, as a full replacement sentence, and cite file:line.
- 'misread' — the affordance or behaviour exists, or works as intended, and the seat simply did not find it. Cite the file:line that proves it.

${FINDINGS_CONTRACT}

report_path ${OUT}/research/33-verify-code-truth.md; json_path ${OUT}/research/33-verify-code-truth.json.`

const V2 = `${PROGRAM}

YOUR ROLE: V2 verify:REPRO (Sonnet). The designer portal is RUNNING at http://localhost:3000 (steward: ${boot ? boot.summary : 'unknown'}). Do not start or stop it. Reproduce each finding LIVE, at the finding's own width AND its own scroll state — that pairing is the whole point of this program.

HOW
- Playwright, headless chromium, run with dangerouslyDisableSandbox: true on the Bash tool (headless Chromium cannot claim a mach port inside the sandbox); log every command you run verbatim into a dated section of ${OUT}/research/00-env-and-ids.md.
- Write your scripts ONLY under ${OUT}/probe/ — never under apps/. Copy the login and viewport bootstrap from ${OUT}/research/capture-shots.mjs (account designer@patina.dev / password123, the auth fixture and the dev-overlay hider it already uses); document ids come from ${OUT}/research/state-ladder.json — re-derive from the document_state view via psql postgresql://postgres:postgres@127.0.0.1:54322/postgres if an id has drifted.
- Viewports: 1440x900, 1280x900, 390x844. Scroll states: top = scrollY 0; seam = letterhead bottom just past 0 with the ticket pinned; mid = the FF&E region head at the top of the frame under the seam; foot = the Record and colophon in frame. Assert the state before judging, exactly as the capture script does. Batch findings by width + scroll state so one page load serves many checks.

VERDICT per finding, exactly one of:
- 'reproduced' — you saw it. Save ${OUT}/probe/repro-<id>.png and name that file in evidence.
- 'not-reproduced' — you looked at the exact surface, width and scroll state and the claimed problem is not there. Say what IS there.
- 'state-dependent' — it needs data or a state you could not create (the seed is thin: 3 FF&E lines, 0 rooms). Say exactly what would settle it.

${FINDINGS_CONTRACT}

report_path ${OUT}/probe/34-verify-repro.md; json_path ${OUT}/probe/34-verify-repro.json.`

const V3 = `${PROGRAM}

YOUR ROLE: V3 verify:CANON-CONTEXT (Sonnet). FOR THE RECORD ONLY. Under this program's canon latitude the ruling ledger is context, not constraint: you are labelling what each finding's suggested fix would touch so the proposal authors can name it. You are NOT pricing amendments, NOT penalising them, and NOT vetoing anything except a hard no-go.

CANON LATITUDE — instruments.md §5, verbatim:

${S5_CANON}

Work from ${OUT}/research/11-canon-digest.md — sections (A) NG1-NG4 verbatim, (B) the R126 register, (C) standing context. Confirm a clause against ${REPO}/docs/design/the-document/DECISIONS.md only with grep -n and narrow sed -n ranges; that file is over 9,000 lines and must never be read whole.

LABEL each finding's suggested fix, exactly one of:
- 'open' — nothing in the ledger describes this ground. Fair game.
- 'amends:<id>' — a ruling describes the behaviour the fix would change. Quote the clause in reason, 25 words maximum. This is NOT a veto and NOT a cost; it is a note for the proposal's canon section.
- 'blocked:NG1' | 'blocked:NG2' | 'blocked:NG3' | 'blocked:NG4' — the fix requires one of the four hard no-gos. This is the ONLY veto available to you. Name which no-go and how the fix collides with it.
- 'misread' — the finding misdescribes what the ledger says. Explain, with the clause quoted.

${FINDINGS_CONTRACT}

report_path ${OUT}/research/35-verify-canon-context.md; json_path ${OUT}/research/35-verify-canon-context.json.`

const [v1, v2, v3] = await parallel([
  () => agent(V1, { label: 'V1 code-truth', phase: 'Refute', model: 'opus', effort: 'high', schema: VERDICT_SCHEMA }),
  () => (boot && boot.ready)
    ? agent(V2, { label: 'V2 live repro', phase: 'Refute', model: 'sonnet', effort: 'high', schema: VERDICT_SCHEMA })
    : Promise.resolve(null),
  () => agent(V3, { label: 'V3 canon-context', phase: 'Refute', model: 'sonnet', effort: 'medium', schema: VERDICT_SCHEMA }),
])
log(`Refuters: code-truth ${v1 ? v1.verdicts.length : 0} verdicts, repro ${v2 ? v2.verdicts.length : 'not run'}, canon ${v3 ? v3.verdicts.length : 0}`)

phase('Kill')
const kill = await agent(`${PROGRAM}

YOUR ROLE: dev-server STEWARD (kill). The refuters are done. Free the ports, unsandboxed (dangerouslyDisableSandbox: true on the Bash tool):
1. kill $(lsof -i :3000 -t) — then the service ports the same way, one call each: 3014, 3015, 3016.
2. If any port is still held after 5 seconds, escalate to kill -9 on that PID.
3. Confirm all four ports are free (lsof -i :<port> -t returns nothing) and say so per port.
4. Append a dated section to ${OUT}/research/00-env-and-ids.md with every command verbatim and the final per-port state.
Return {summary, ready:false, pid:'', killed:true} — killed=true only if all four ports are free.`,
  { label: 'steward kill', phase: 'Kill', model: 'sonnet', effort: 'low', schema: STEWARD_SCHEMA })
log(`Steward kill: ${kill ? kill.summary : 'null'}`)

phase('Scribe')
const vmap = (v) => new Map(((v && v.verdicts) || []).map(x => [x.id, x]))
const m1 = vmap(v1), m2 = vmap(v2), m3 = vmap(v3)
const ids = Array.from(new Set([].concat(
  Array.from(m1.keys()), Array.from(m2.keys()), Array.from(m3.keys()))))
const tally = ids.map(id => {
  const a = m1.get(id), b = m2.get(id), c = m3.get(id)
  const code_truth = a ? a.verdict : 'unverified'
  const repro = b ? b.verdict : 'unverified'
  const canon = c ? c.verdict : 'unverified'
  const survives = code_truth !== 'misread' && repro !== 'not-reproduced' && canon !== 'misread'
  return { id, survives, code_truth, repro, canon, blocked: String(canon).indexOf('blocked:') === 0 }
})
const survivorCount = tally.filter(t => t.survives).length
log(`Orchestrator tally: ${survivorCount}/${tally.length} survive (code misread ${tally.filter(t => t.code_truth === 'misread').length}, not-reproduced ${tally.filter(t => t.repro === 'not-reproduced').length}, canon misread ${tally.filter(t => t.canon === 'misread').length}, blocked ${tally.filter(t => t.blocked).length})`)

const SCRIBE_SCHEMA = { type: 'object', properties: {
  json_path: { type: 'string' }, md_path: { type: 'string' },
  survivors: { type: 'number' }, dropped: { type: 'number' }, blocked: { type: 'number' },
  by_severity: { type: 'object', properties: {
    blocker: { type: 'number' }, high: { type: 'number' }, medium: { type: 'number' }, low: { type: 'number' } },
    required: ['blocker', 'high', 'medium', 'low'], description: 'surviving findings only' },
}, required: ['json_path', 'md_path', 'survivors', 'dropped', 'blocked', 'by_severity'] }

const scribe = await agent(`${PROGRAM}

YOUR ROLE: SCRIBE. Do the merge on disk with python3 — write the script to ${OUT}/research/merge-verdicts.py and RUN it; do not merge by hand.

INPUTS: ${OUT}/research/30-collated-findings.json (the canonical findings) and the three verdict files ${OUT}/research/33-verify-code-truth.json (code truth), ${OUT}/probe/34-verify-repro.json (repro), ${OUT}/research/35-verify-canon-context.json (canon context). Each verdict file is an array of {id, verdict, reason, evidence, revised_claim}. A missing or unparseable file means every id is 'unverified' for that refuter — say so in the header rather than failing.

PER FINDING add: code_truth, code_note, repro, repro_note, canon, canon_note, claim, survives.
- claim = the revised_claim from code truth when its verdict is 'narrows' and revised_claim is non-empty (the narrower claim REPLACES the observation as the finding's claim); otherwise the original observation.
- survives = code_truth != 'misread' AND repro != 'not-reproduced' AND canon != 'misread'.
- A row whose canon verdict starts with 'blocked:' is KEPT (survival is unaffected) and FLAGGED — set blocked=true and carry the no-go id; the proposal authors must see it.

WRITE ${OUT}/research/31-verified-findings.json — ALL rows, each with survives true or false. Validate it parses with python3 -c "import json;print(len(json.load(open(...))))".

WRITE ${OUT}/research/31-verified-findings.md — (1) a header with the counts: total findings, survivors, dropped, killed by each refuter separately, blocked:NG rows by no-go id, and any refuter that returned nothing; (2) the SURVIVING table ordered by (number of seats desc, severity desc): id · title · seats · severity · confidence · width · scroll_state · why_it_blocks · frame_cost_estimate · tasks · code_truth · repro · canon · claim; (3) a BLOCKED table: id · title · no-go · canon_note; (4) a KILLED table: id · title · which refuter killed it · note. Print the counts to stdout at the end of the script.

The orchestrator's own tally, for cross-check — if your numbers differ, say where in the header: ${JSON.stringify(tally)}

Your final message IS the return value: return ONLY {json_path, md_path, survivors, dropped, blocked, by_severity} where by_severity counts SURVIVING findings.`,
  { label: 'scribe 31-verified', phase: 'Scribe', model: 'sonnet', effort: 'low', schema: SCRIBE_SCHEMA })

if (!scribe) {
  return { gate: 'FAIL', reason: 'scribe returned nothing', survivors: survivorCount, dropped: tally.length - survivorCount, blocked: tally.filter(t => t.blocked).length, by_severity: null }
}
return {
  gate: scribe.survivors > 0 ? 'pass' : 'FAIL',
  survivors: scribe.survivors,
  dropped: scribe.dropped,
  blocked: scribe.blocked,
  by_severity: scribe.by_severity,
}
