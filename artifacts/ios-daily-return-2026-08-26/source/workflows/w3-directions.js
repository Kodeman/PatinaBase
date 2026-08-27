export const meta = {
  name: 'ios-daily-return-w3-directions',
  description: 'Shared planks, two directions (A within canon, B may amend), eight critics, v2 revisions, three judges — for the Patina iOS daily-return + purchase review',
  phases: [
    { title: 'Planks', detail: 'fixes both directions carry' },
    { title: 'Authors', detail: 'Direction A (within canon) ∥ Direction B (may amend), Opus' },
    { title: 'Critics', detail: 'homeowner · designer · feasibility · canon, per direction' },
    { title: 'Revise', detail: 'authors answer every blocking/major critique → v2' },
    { title: 'Judges', detail: 'J1 homeowner return · J2 purchase + designer trust · J3 feasibility' },
  ],
}

const ROOT = '/Users/kody/Code/patina-merged'
const OUT = `${ROOT}/artifacts/ios-daily-return-2026-08-26`
const R = `${OUT}/research`
const S = `${OUT}/source`
const INSTR = `${S}/instruments.md`

const COMMON = `You are one agent in an autonomous multi-agent review program ("The Daily Return") of the Patina iOS CLIENT app (apps/mobile/Patina). The orchestrator reads only your structured return and your files on disk.
Ground rules:
- Output root: ${OUT}. Write where the brief says. Never write to the session scratchpad.
- Do NOT run git commit/add/stash/checkout. Do NOT edit any app source. Do NOT mutate production.
- Evidence: cite finding ids (F##) from ${R}/31-verified-findings.json, shots from ${OUT}/shots, and repo file:line. Quote labels verbatim. Brand voice per ${ROOT}/.claude/skills/patina-brand-voice/SKILL.md (technology silent; designers are the intelligence layer; Midwest; no luxury haze; no streak/badge/urgency loops).
- Read ${INSTR} §0, §6 + §6b (canon guard, incl. C23 Option B / C24 direct orders / C25 Apple Pay / C26 push), §7 (direction constraints — the required section order), §8 (judge rubric), §9 (mock + screen-sheet spec) — then only what your brief names.
- Grounding: ${R}/10-code-anatomy.md · 15-task-paths.md · 16-token-table.md · 11-canon-digest.md · 12-backend-reality.md (§12 delta ledger) · 17-gap-fills.md · ${ROOT}/apps/mobile/Patina/OPTION_B_ACCEPTANCE.md. Findings: ${R}/36-findings-by-theme.md (start here), ${R}/31-verified-findings.md/.json, ${R}/32-refuted-findings.md (what NOT to build on). Panel voices: ${R}/2x-panel-*.md.
- REFUTER CORRECTIONS THAT OVERRIDE THE MERGED STATUS (the merge counted the canon refuter's "confirmed" as contrary evidence to code-truth refutations; it is not — R1's code reading wins on code claims, see ${R}/33-verify-code-truth.json and ${R}/35-verify-repro.json notes): (1) Messaging EXISTS — ThreadListView, ThreadDetailView, MessagingAPIClient, and a "Message your designer" Companion row on project/decision/documents/notifications/design-request screens; the true finding is narrower: a client cannot START a thread, the Studio "Conversation" block has no chevron, and the home Companion has no message row (F21/F33/F35/F82/F94 are refuted as written). (2) Decision confirmation EXISTS — "Choose this" opens DecisionConsentSheet (confirm + optional e-signature + Approve/Cancel); only the no-defer/no-"neither" half survives (F75/F88/F116/F166 refuted). (3) The room "feet converted as meters" bug does NOT exist — the ft/m unit is silently persisted in UserDefaults (patina.scan.manual_entry.unit) and restored on appear, and the toggle's targets are 12×13 / 6×13 pt; the screen is ScanFallbackEntryView, not ManualRoomEntryView (F18 refuted; F40 is the real finding). (4) The Saved door: the Companion Saved row is hidden at zero TOTAL saved count (F14), not room-scoped (F39/F149/F181 refuted). (5) F57 (Studio rows invisible to VoiceOver) is a harness artifact — do not claim it. (6) The engaged-tier invisibility family (F10, F24, F25, F73, F74, F111, F128, F175) has ONE upstream cause: DesignRequestStatusService.fetchLeadRows filters leads by client_request_id IS NOT NULL, so portal-created leads never promote the tier — the matched-designer surface ("You're matched with <designer>", Today branch at TodayExperience.swift:80-91) is already built; fix the filter, do not design a new module for it. (7) Proposal line prices are stripped SERVER-SIDE by get_client_proposal_bundle unless client_visibility_tier = 'full' (defaults to 'milestone') — a data-policy ruling, not a UI gap. (8) The product-detail trap is a shipped bug (two FKs products→vendors on main) but escapable via the Companion's "Home" row; severity S1. (9) The 120pt Companion Hearth is an OPAQUE safeAreaInset painted over scrolled content on pushed screens — padding is not the fix. (10) Sign Out exists (AccountView) but is stranded behind a Settings "Account" NavigationLink that does not navigate (cause unknown). (11) The white first frame is iOS's generated launch screen, not SplashView. (12) Client-facing EMAIL rails for invoices/decisions/proposals are live and cron-scheduled; push is dead for money; an in-app proposal_sent row IS written by the real send path (the seed bypassed it). (13) Guest→account local-data claim is documented as INTENDED in AuthService.swift:169-197 — argue against the intent, not the bug. Duplicate clusters to merge when citing: F04=F31=F32, F16=F34, F23=F29, F28=F36, F22=F26, F30=F37.
- Your FINAL action must be the StructuredOutput tool call, even if steps failed — report failures inside it. Return only the compact index the schema asks for.`

const safe = async (label, p) => { try { const r = await p; if (!r) log(`${label}: returned null`); return r } catch (e) { log(`${label}: threw ${e && e.message ? e.message : e}`); return null } }

phase('Planks')
const PLANKS = { type: 'object', required: ['file', 'planks'], properties: { file: { type: 'string' }, planks: { type: 'array', items: { type: 'object', required: ['id', 'title', 'size'], properties: { id: { type: 'string' }, title: { type: 'string' }, size: { type: 'string' }, findings: { type: 'array', items: { type: 'string' } } } } }, failures: { type: 'array', items: { type: 'string' } } } }
const planks = await safe('planks', agent(`${COMMON}

ROLE: planks author. Write ${S}/shared-planks.md — the fixes BOTH directions carry regardless of which wins: honesty repairs (C5/C28 items the panel confirmed), broken loops (Saved/boards/room-scoped saved, tour anchor, re-save duplicates), trust fields that exist but are not shown (dimensions, lead time, maker story), the notification-permission moment, the share link that cannot open the app, and anything the verified findings mark S0/S1 that is not a direction choice but a repair. Each plank: id SP-01…, title, findings answered (F ids), what changes (one paragraph, screen + copy verbatim where copy changes), where (file:line to touch), backend delta (none / migration / edge fn — cite §12), size S/M/L (S ≤ 1 day, M ≤ 3, L ≤ 1 week), risk. Order by severity of what they fix. ≤ 20 planks; do not include direction-level choices (home composition, purchase path, notification strategy) — those belong to A/B.`, { label: 'planks', phase: 'Planks', model: 'opus', effort: 'high', schema: PLANKS }))
log(`Planks: ${planks ? planks.planks.length : 'NULL'}`)

phase('Authors')
const DIR = { type: 'object', required: ['file', 'name', 'thesis', 'screens', 'first_slice'], properties: { file: { type: 'string' }, name: { type: 'string' }, thesis: { type: 'string' }, screens: { type: 'array', items: { type: 'string' } }, first_slice: { type: 'string' }, amendments: { type: 'array', items: { type: 'string' } }, findings_answered: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } } } }
const AUTHOR_COMMON = `Read ${S}/shared-planks.md (assume every plank ships; do not restate them). Write your direction as ${S}/direction-{x}.md in EXACTLY the section order of instruments §7 (1 name + thesis + the day; 2 home per tier; 3 remembered investment; 4 return surfaces beyond the app; 5 purchase path; 6 designer in the client's home; 7 findings answered table; 8 amendments; 9 first slice → waves → backend deltas → risks → rollback; 10 what it does not do), then an 11th section "Mock manifest": for each of the ≥6 required screens (§9) plus any extra, a heading, the tier/state it shows, a layout description precise enough for a CSS mock builder who has only the token table (block order top→bottom, every label verbatim, which components are existing Features/… views vs new), and its screen sheet (purpose · entry points · components · copy · data source · states · interactions + analytics event names · tier behaviour · new vs today). Name real seed products/vendors/stories where a mock needs content (see 12-backend-reality §8 and the shots); invent nothing the seed does not have unless labelled example copy. Answer the three morning/lunch/evening questions with the actual first screen. Sticky ≠ manipulative — name every mechanic you rejected and why. Write for Kody: plain, specific, no hedging; ≤ 700 lines.`
const [dirA, dirB] = await parallel([
  () => safe('A', agent(`${COMMON}

ROLE: author of Direction A — WITHIN CANON. Zero amendments: no tab bar (C1), Option B's Today contract stands (C23: exactly one next move, one story, one active room; Companion collapsed as the relationship layer), canonical names (C4), honesty (C5), brand voice (C6). You MAY re-mount orphaned July rail pieces only where the Today contract permits (e.g. a Next Move that opens Browse; Studio rows below the four modules if the contract's "Studio grouped by attention" allows a door on the home — argue it from the acceptance doc's text, and name the C2-vs-C23 conflict for Kody where you rely on it). The purchase path must use the rail that exists (C24 direct_orders + C25 hosted Checkout with Apple Pay) and must say how the designer is credited when one is engaged (the attribution decision is open — propose one, price it). Return surfaces: what earns the notification permission and which of the existing push callers / one new call site (C26) carry it; widgets are allowed if you price the new target honestly. Say plainly what A declines to do because canon forbids it and what that costs (findings left unanswered). ${AUTHOR_COMMON.replace('{x}', 'a')}`, { label: 'author A', phase: 'Authors', model: 'opus', effort: 'xhigh', schema: DIR })),
  () => safe('B', agent(`${COMMON}

ROLE: author of Direction B — MAY AMEND CANON. Every amendment in the form "B-n amends C# — what · why (finding ids) · cost · rollback" (instruments §7.8); an amendment without a finding behind it is not allowed. Candidates you may consider (only if the findings justify them): the home composition beyond Option B's four modules (C23) or a return to the marketplace-first rail (C2); a bottom navigation re-evaluation (C1 — R29 said "revisit post-Track-D"; U25 logged tab-bar evidence); a rooms-first or house-first home; a household/partner concept (greenfield, C24-style delta); a maker layer (vendors already join get_recommendations); order status beyond paid (needs a migration, §12); designer attribution on direct orders. Be bold where the findings are, and price it. The purchase path must still be Apple-compliant (C15) and must credit the designer when one is engaged. ${AUTHOR_COMMON.replace('{x}', 'b')}`, { label: 'author B', phase: 'Authors', model: 'opus', effort: 'xhigh', schema: DIR })),
])
log(`Authors: A=${dirA ? dirA.name : 'NULL'} · B=${dirB ? dirB.name : 'NULL'}`)
if (!dirA && !dirB) return { planks, dirA, dirB }

phase('Critics')
const CRIT = { type: 'object', required: ['file', 'blocking', 'major', 'minor'], properties: { file: { type: 'string' }, blocking: { type: 'array', items: { type: 'string' } }, major: { type: 'array', items: { type: 'string' } }, minor: { type: 'array', items: { type: 'string' } }, praise: { type: 'array', items: { type: 'string' } } } }
const lenses = [
  { key: 'homeowner', model: 'opus', brief: 'Read the H1, H2, H3 panel reports and become those three people in turn. For each: would I open this tomorrow at my hour (7:40am / 12:30pm / 9:10pm)? after two weeks away? what on the first screen is honestly new? would I buy a $4,000 piece here and what is missing before I would? Which mechanic feels like being "engaged" (Walt leaves)? Which finding that mattered to me is unanswered? Blocking = a homeowner would not return or would not trust the purchase.' },
  { key: 'designer', model: 'sonnet', brief: 'Read the D1, D2, D3 panel reports and become those three designers in turn. Does the client see me; do purchases credit me and land on my FF&E schedule; does this cut my inbox or add a channel; what competes with the relationship; is the through-designer path honest about who is responsible when a piece arrives damaged? Blocking = a designer would stop sending clients here.' },
  { key: 'feasibility', model: 'opus', brief: 'Check every claim against the code and the backend ledger (12-backend-reality §12, 17-gap-fills): does the named view/RPC/edge function exist as described; is each backend delta the smallest compliant one (C13 — no new NestJS service); is the first slice really ≤ 2 weeks for one iOS engineer + edge functions (list the files it touches); Apple review risk (physical goods → no IAP; a widget/Live Activity target; notification prompts; Sign in with Apple); rollback honesty; anything requiring device-only verification presented as sim-provable. Blocking = a load-bearing claim is false or the slice is not a slice.' },
  { key: 'canon', model: 'sonnet', brief: 'Check the direction against instruments §6 + §6b and 11-canon-digest §6 row by row: every place it silently re-proposes a ruled item (Direction A must have zero amendments; Direction B must name each with cost + rollback); every canonical name it breaks (C4/C17/C18); every honesty rule it bends (a fabricated "new", a fake urgency, a streak); brand-voice drift (technology-first, "curated", luxury haze, "AI"); mock-manifest copy that a homeowner would not understand. Blocking = an unnamed amendment or an honesty breach.' },
]
const critique = (x, d) => lenses.map(l => () => safe(`crit ${x}-${l.key}`, agent(`${COMMON}

ROLE: critic — ${l.key} lens — of Direction ${x.toUpperCase()} "${d.name}" (${d.file}). ${l.brief} Write ${S}/critique-${x}-${l.key}.md: blocking / major / minor lists (each item: the section it hits, the problem, the evidence, the fix you would accept), then what is genuinely good (the author must keep it). Report every issue with its own severity; do not filter.`, { label: `crit ${x}-${l.key}`, phase: 'Critics', model: l.model, schema: CRIT })))
const critsA = dirA ? await parallel(critique('a', dirA)) : []
const critsB = dirB ? await parallel(critique('b', dirB)) : []
const summarize = (cs) => cs.filter(Boolean).map(c => ({ file: c.file, blocking: c.blocking, major: c.major }))
log(`Critics: A blocking=${critsA.filter(Boolean).reduce((n, c) => n + c.blocking.length, 0)} · B blocking=${critsB.filter(Boolean).reduce((n, c) => n + c.blocking.length, 0)}`)

phase('Revise')
const revise = (x, d, cs) => safe(`revise ${x}`, agent(`${COMMON}

ROLE: author of Direction ${x.toUpperCase()} "${d.name}", revising to v2. First copy ${d.file} to ${d.file.replace('.md', '.v1.md')}. Then read the four critiques ${S}/critique-${x}-{homeowner,designer,feasibility,canon}.md and rewrite ${d.file} in place: answer EVERY blocking and major item (change the direction, or rebut in a "Critique log" section at the end with the reason — a rebuttal must cite evidence), take the minors you agree with, keep what the critics praised, keep the §7 section order and the Mock manifest, ≤ 750 lines. Critique summary: ${JSON.stringify(summarize(cs))}`, { label: `revise ${x}`, phase: 'Revise', model: 'opus', effort: 'xhigh', schema: DIR }))
const [dirA2, dirB2] = await parallel([
  () => dirA ? revise('a', dirA, critsA) : Promise.resolve(null),
  () => dirB ? revise('b', dirB, critsB) : Promise.resolve(null),
])
log(`v2: A=${dirA2 ? 'ok' : 'NULL'} · B=${dirB2 ? 'ok' : 'NULL'}`)

phase('Judges')
const JUDGE = { type: 'object', required: ['file', 'scores', 'winner', 'grafts'], properties: { file: { type: 'string' }, scores: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } }, winner: { type: 'string' }, grafts: { type: 'array', items: { type: 'string' } }, verdict: { type: 'string' }, failures: { type: 'array', items: { type: 'string' } } } }
const judges = [
  { key: 'j1-homeowner-return', model: 'opus', brief: 'J1 · Homeowner return (instruments §8): for each of H1/H2/H3 and each direction, "would they open it tomorrow?" 0–10 with the screen that earns it; the 7:40am / 12:30pm / 9:10pm test; the two-weeks-away test; honesty of the reward. Total /40 per direction.' },
  { key: 'j2-purchase-designer-trust', model: 'opus', brief: 'J2 · Purchase & designer trust (instruments §8): would D1/D2/D3 send clients here (0–10 each per direction); is the purchase path Apple-compliant, designer-attributed, and trustworthy for a $4,000 piece (0–10). Total /40 per direction.' },
  { key: 'j3-feasibility', model: 'opus', brief: 'J3 · Feasibility (instruments §8): first-slice realism (0–10), backend deltas vs C13 and the §12 ledger (0–10), Apple review + data risk (0–10), rollback (0–10). Total /40 per direction. Verify claims against code where they are load-bearing.' },
]
const judged = await parallel(judges.map(j => () => safe(j.key, agent(`${COMMON}

ROLE: judge ${j.brief} Read both v2 directions (${S}/direction-a.md, ${S}/direction-b.md), the planks, the eight critiques, and the findings. Write ${S}/judge-${j.key}.md: a scoring table with one line of reasoning per cell, the verdict (which direction, and which of its parts must ship first), and grafts — what the losing direction has that the winner must take. Never average with another judge. Return scores {a, b}, winner, grafts (≤ 8 one-liners), verdict (≤ 60 words).`, { label: j.key, phase: 'Judges', model: j.model, effort: 'high', schema: JUDGE }))))
log(`Judges: ${judged.map((j, i) => `${judges[i].key}: ${j ? `A ${j.scores.a} / B ${j.scores.b} → ${j.winner}` : 'NULL'}`).join(' · ')}`)

return {
  planks: planks && { file: planks.file, n: planks.planks.length, ids: planks.planks.map(p => `${p.id} ${p.title} (${p.size})`) },
  a: dirA2 && { file: dirA2.file, name: dirA2.name, thesis: dirA2.thesis, screens: dirA2.screens, first_slice: dirA2.first_slice, amendments: dirA2.amendments },
  b: dirB2 && { file: dirB2.file, name: dirB2.name, thesis: dirB2.thesis, screens: dirB2.screens, first_slice: dirB2.first_slice, amendments: dirB2.amendments },
  critics: { a: summarize(critsA), b: summarize(critsB) },
  judges: judged.map((j, i) => j && { key: judges[i].key, scores: j.scores, winner: j.winner, verdict: j.verdict, grafts: j.grafts }),
}
