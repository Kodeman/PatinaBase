export const meta = {
  name: 'document-lens-w3a-drafts',
  description: 'W3a: one planks author fixes the moves the evidence forces, two rival authors draft opposing lens proposals from the same evidence without seeing each other, and four fresh critics attack both',
  phases: [
    { title: 'Planks', detail: 'one Opus author writes source/shared-planks.md — the moves both proposals must adopt identically, each cited to verified F-ids' },
    { title: 'Draft', detail: 'X (the spine is the lens) and Y (the paper is the lens) draft proposal-x-v1.md and proposal-y-v1.md in parallel, neither seeing the other' },
    { title: 'Critique', detail: 'C-design, C-feasibility, C-practitioner and C-access each read BOTH proposals and write one critique file with a seven-axis scorecard per proposal' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const OUT = REPO + '/artifacts/document-lens-proposal-2026-08-28'
const VOICE_SKILL = REPO + '/.claude/skills/patina-brand-voice/SKILL.md'

const ASK = "> \"We are getting close to a design that feels right on the document. The spine on the left is still cluttered and could be better utilized to navigate the ins and outs of the document. The main header contains great info but takes up most of the screen height when opened up, each section is crammed into the next and the margin seems cramped for the space needed for the functionality it contains. Have a team of UI and UX designers sit down with the Patina engineering and interior design teams. Work with them to design the document so that it contains the needed information and actions, while feeling uncluttered and peaceful. Explore animations, content that appears when it needs to and lends to space when it isn't needed in frame. Think of the document as a smart lens that is always adjusting focus on what is needed as the designers move through the document. Present your strongest proposal to achieve this in an html document accompanied with a high fidelity mockup showcasing how the team will accomplish this challenging User experience and UI requirements.\"\n\nThe unit of analysis for every seat in this program is **four scroll states x three widths**: `s0 top` (scrollY 0) · `s1 seam` (the letterhead just gone, the ticket pinned as its two-line seam) · `s2 mid` (the FF&E region head at the top of the frame, under the seam) · `s3 foot` (the Record and colophon in frame); at 1440x900, 1280x800 and 390x844. A finding without a scroll state is out of scope."

const S5_CANON = "## §5 Canon latitude\n\n```\nCANON LATITUDE (2026-08-28, Kody): the ruling ledger docs/design/the-document/DECISIONS.md\n(last id R126) is CONTEXT, not constraint. Amend freely. Do NOT price amendments and do NOT\npenalise them — a refuter labels what a move amends, for the record only. Four hard no-gos\nstand and are not re-proposable:\n  NG1  D1 — one document at a time. No split view, no tabs, no peek/hold, no persistent\n       global nav over an open doc. Esc / Put down is the exit.\n  NG2  D4 shadow budget — exactly one token, --elevation-sheet: 0 1px 2px rgba(44,41,38,.08),\n       at three sites (margin chip, open ledger sheet, studio drawer). Zero other shadows.\n       Mockups, fragments and deck must show 0 box-shadow beyond that token (computed-style\n       sweep, not source grep).\n  NG3  The Thumb Index — removed by Kody, \"do not re-propose\".\n  NG4  The R126 ratified visual register is the FLOOR — 40px Playfair letterhead, 24px Playfair\n       region heads, five-step scale 40/24/18/15/14, mono 11px floor, three rule weights\n       (--rule-hair 1px 10% / --rule-mid 1.5px #2C2926 / --rule-strong 2px + hairline double),\n       paper #FCFAF6, rail stock #E8E3DB, desk #FAF7F2, charcoal #2C2926, the -ink text\n       companions (clay #7C5E30, terracotta #9C5340, golden-hour #79651E, sage #5F6B57), muted\n       ramp #4E4339/#5A4E43/#65594E, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal\n       word, -1.5deg), six saturated stage tab plates (--tab-brief #497093 … --tab-install\n       #823832, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms\n       in / 200ms out, --ease-editorial cubic-bezier(0.22,1,0.36,1), ~1.12:1 over own ground,\n       flat -still tint under reduced motion), 48px product crops on catalog-linked lines.\n       The proposal BUILDS ON this register; it does not restyle it. \"Typography goes no further\n       than the mockup\" (R126). THE STUDIO desk block is untouched.\nKody's taste on record: large tinted surfaces read as \"silly/terrible\"; colour belongs on small\nstate-carrying things; \"the sections and animated highlighting\" were loved; \"don't push the\ntypography further\".\nEverything else — composition, mount order, disclosure, motion, the spine's job, the header's\njob, spacing tokens, what appears when — is open ground.\n```"

const OPUS_RULES = `OPUS BRIEF RULES — deliver exactly what is asked. No unrequested features, no unrequested abstractions, no extra deliverables, no files beyond the ones named in your output rules. Concise and evidence-grounded: every claim carries an F-id, a file:line, a measured number, or a quoted line from a report on disk. Prose that carries no evidence is cut.`

const REVIEWER_RULES = `REVIEWER RULES — report EVERY defect with severity AND confidence. Never filter by perceived importance and never suppress a low-severity or low-confidence finding; a severity filter costs recall, and the synthesis, not you, decides what matters. Number every defect Dx-nn, where x is your critic letter and nn runs from 01. Say which proposal each defect is against (X, Y, or both — a defect against both gets a number under each). Every defect names the scroll state (s0 / s1 / s2 / s3) and the width (1440 / 1280 / 390), cites the proposal section it lands in, and where relevant a file:line. Confidence below 0.5 appends the sentence "what would settle this".`

const PROGRAM = `You are one agent in "The Document — The Smart Lens" (2026-08-28): a multi-agent design program over the Patina designer portal's document surface, /doc/[id] — one paper per engagement, with its letterhead, its job ticket, its guide sentence, its regions, its left spine and its right margin. Patina connects interior designers with makers of custom furnishings. Nothing in the product is changed by this program; the deliverable is a proposal and a mockup. Repo ${REPO}.

You are in W3 — the DRAFTING wave. Two panels (W2a) and a refutation wave (W2b) are done; their verified findings are on disk and are the evidence you argue from.

THE ASK (Kody, 2026-08-28) — verbatim, quoted in every brief:
${ASK}

HARD RULES
1. Durable path: write your deliverable to the exact absolute path you are given under ${OUT}/ (mkdir -p as needed). The orchestrator reads the FILE. Never write to /tmp or a scratchpad.
2. Forbidden: git add/commit/stash/push; editing anything under apps/, packages/, supabase/, docs/; starting or stopping dev servers. You MAY write new files under ${OUT}/ only. You MAY read anything in the repo, and you SHOULD read the real source tree.
3. Quote what is on screen verbatim (labels exactly as printed, including case and middots). Never paraphrase a label.
4. Your final message IS the return value — return only the compact structured summary the schema asks for; write the full document to the named absolute path. Never paste the document into the return value.`

const KEY_FACTS = `KEY EVIDENCE FACTS — measured, not asserted. Quote them by number; a design move that does not move one of these numbers is decoration.
- At 1440x900, scroll 0, the header stack is 111.7% of the 900px viewport: the first region head lands at y 1005 — below the fold, on a document with three FF&E lines.
- At s1, with the letterhead gone and the ticket pinned as its seam, the header and summary still occupy 60.7% of the frame.
- Spine ink is 54.9% of the rail on a rich project spread and 13.9% on a pre-work spread at 1440. Nearly half the rail, and seven eighths of a pre-work rail, is void.
- The set of distinct inter-region gaps is {6, 29, 56}px — three different answers to one question, on one page.
- The ticket fold is a hard, unanimated 283px layout jump at scrollY 280: everything below it moves under her while she is reading.
- Folding a region drops focus to the body element.
- Pre-work documents (brief, discovery, direction, proposal) print zero elements carrying data-region-head — the running index has nothing to index there.
- Six of the eight job-ticket doors exist only at s0; below the seam they are gone from the paper entirely.`

const EVIDENCE = `INPUTS ON DISK (absolute paths; read the ones your brief depends on, and read the brief FIRST):
- ${OUT}/source/brief.md — the author brief: the four lens laws, the four organs and the question each must answer, SC1-SC13, the keeps, the shape you deliver. READ THIS FIRST.
- ${OUT}/source/mechanics.md — the candidate mechanics catalogue, M-1 through M-10, with the conflict summary.
- ${OUT}/source/rubric.md — the seven axes with anchors at 3, 6 and 9, the two automatic returns, the critic pass, and how critics report.
- ${OUT}/source/instruments.md — §1 the task script T1-T16, §2 the four practitioner personas, §6 the proposal contract, §7 the judge rubric, §8 the mock specimen.
- ${OUT}/source/specimen.md — the Vandersteen residence: the one set of data every proposal and mockup uses.
- ${OUT}/research/31-verified-findings.md and ${OUT}/research/31-verified-findings.json — the refuted-and-verified findings, F-ids. This is the evidence of record; cite F-ids, not impressions.
- ${OUT}/research/30-collated-findings.md — the panel's merged findings behind those F-ids, with the frame-budget table and the merge log.
- ${OUT}/research/12-layout-measurements.md and ${OUT}/research/12-layout-measurements.json — measured rects per document x width x scroll state. Every frame-budget number you write is checked against the JSON.
- ${OUT}/research/10-code-anatomy.md — the shell, the header stack in mount order with file:line, the spine, the margin, disclosure already shipped, the spacing-site table, the motion inventory and the twelve reduced-motion blocks, every --doc-seam-height consumer, the test blast radius.
- ${OUT}/research/11-canon-digest.md — NG1-NG4 verbatim, the R126 register quoted, standing context one line each.
- ${OUT}/research/29-panel-e1.md — the engineering feasibility seat: cost bands with file:line for every mechanism a lens could ask for. Your engineering path agrees with it or says where it disagrees and why.
- ${OUT}/research/25-panel-p1.md — the P1 walk, T1-T16 in the solo principal's voice with a frame-budget line on every task.
- ${OUT}/probe/03-interactive-probe.md — dynamic behaviour: ticket fold and pin timing, scroll-spy handoff points, region unmount and focus destination, the Esc chain, the palette, hover-wash timing, the 1280 margin sheet, CLS over a scripted scroll in both motion registers.
- ${OUT}/research/01-shot-ledger.md — every screenshot, what it shows, what is unreachable, the capture caveats. AUTHORITATIVE: if a shot is marked non-verified or absent, skip it and say so.
- ${OUT}/shots/ — open images with the Read tool. Minimum set you actually Read: w1440-rich-s0.png, w1440-rich-s1.png, w1440-rich-s2.png, w1280-rich-s1.png, m390-rich-s1.png, w1440-spine-full.png, w1440-ticket-seam.png, w1440-margin-rail.png. Run ls ${OUT}/shots first.
- ${OUT}/mock/KIT.md — the mockup kit: what the mockup can build from, and the probe it must satisfy. Your mechanics must be buildable in it.
- ${VOICE_SKILL} — the Patina brand voice skill. Load and follow it: this document is read by Kody, and it is written in Patina's voice, not in product-management English.`

const CAVEATS = `CAVEATS YOU MUST HONOR
- The seed data behind the shots is synthetic: the rich document has only 3 FF&E lines and 0 rooms. The specimen (instruments §8, source/specimen.md) is the richer world the design must survive; say which way a claim moves on a real 60-line schedule.
- Capture artefact: in fullPage screenshots the fixed bottom Studio Drawer strip lands mid-image at the original viewport-bottom position. That is the harness, not the product. Judge from the viewport shots.
- You cannot click a running app. Where you would need to click to know, say what you EXPECT, cite the anatomy or probe line that says what actually happens, and mark confidence accordingly.`

const CONTRACT = `THE DELIVERABLE — instruments.md §6, the proposal contract. ELEVEN sections, in this order, with these names. A missing section is a return.
1. Thesis — max 120 words, containing exactly one falsifiable sentence: a claim a measurement in 12-layout-measurements.json or the mockup probe could show to be false. Set it off so a judge finds it first.
2. What stays identical — the R126 register, the tokens, the type scale, the stamps, the tab plates, the wash, the desk block, and every organ you are not touching.
3. Lens mechanics table — one row per mechanic, columns exactly: trigger · what changes · from-to · duration and easing · reduced-motion equivalent · what never moves · F-ids. NO EMPTY CELLS, and the reduced-motion column is a real FORM (a flat tint, an instant swap, a printed word, a static rule) that carries the same information — never "n/a", never "no animation". from-to carries real values in px, opacity or ink weight. what never moves is the layout promise the row makes.
4. Organ by organ — spine · header · region heads and spacing · margin · motion grammar · the 1180-1439 tier · 390. Each with a before-after and the mount-order consequence: what moves in page.tsx's child order, what no longer mounts, what mounts somewhere new.
5. The lens state machine — the five states at rest · reading · editing · condensed · mobile. Per state: the lens line, the rail, each region's density, the margin, the entry trigger, the exit trigger, and the reverse of every transition. A transition with no stated reverse violates the honesty law.
6. Frame budget — a table against 12-layout-measurements.json: today's chrome / header / work split per scroll state x width, and the target. Target numbers are mandatory for at least SC1 (first region head y at 1440 at rest, target <= 405px against today's 1005px), SC2 (condensed header band height at 1440, target <= 108px), SC3 (lens-line height at scroll 0 / 400 / 1200, condensed <= 64px and STABLE — the same number at 400 and 1200), SC4 (rail utilisation inkPx/railHeightPx at 1440, >= 70% project against today's 54.9%, >= 55% pre-work against today's 13.9%). A table without target numbers scores 3 on axis 1 at best.
7. Findings addressed — every verified blocker and high in 31-verified-findings, answered or refused with a reason. A refusal is legitimate; silence is not.
8. Canon note — what this builds on in R126, and what it changes that an existing ruling describes: NAMED, NOT PRICED. Cite the id, quote at most 25 words, say what it becomes. Then NG1, NG2, NG3, NG4, each with one sentence saying HOW this proposal leaves it untouched — a mechanism, not a claim.
9. Engineering path — waves, each valuable on its own. Per wave: the files by REAL path, the mechanism, the tests. Answer explicitly what becomes of (a) use-region-fold's three voices, (b) the ticket seam and every --doc-seam-height consumer, (c) the running-index observer's -20% 0px -62% 0px band and its 700ms jump lock. List every test rewritten or deleted by real path, including the 1500-character regex in apps/designer-portal/src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19. Name the gates that stay green (shadow-gate.test.ts, contrast.test.ts). State the rollback per wave. YOU MUST ls EVERY PATH YOU CITE — run ls on each file path before it goes in the document, and delete or correct any path that does not exist. A fabricated path is the fastest way to lose axis 4.
10. Risks — at least FIVE, each with the falsifying observation: the thing we would see, in the first week of building or the first week of use, that proves the risk has come true.
11. Refuses — at least FOUR. Things a reader will expect and this proposal deliberately does not do, each with the reason it was refused rather than deferred.

ALSO MANDATORY: name EVERY mechanic in ${OUT}/source/mechanics.md (M-1 through M-10) exactly once, as adopted, adapted or refused, with one sentence each. A mechanic left unmentioned is a hole in the proposal.`

const PLANKS_SCHEMA = { type: 'object', properties: {
  count: { type: 'number' },
  planks: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string', description: 'SP-01 upward' },
    title: { type: 'string', description: 'max 80 chars' },
    f_ids: { type: 'array', items: { type: 'string' }, description: 'max 5 verified F-ids' } },
    required: ['id', 'title', 'f_ids'] } },
}, required: ['count', 'planks'] }

const AUTHOR_SCHEMA = { type: 'object', properties: {
  thesis_sentence: { type: 'string', description: 'the one falsifiable sentence, max 240 chars' },
  mechanics_adopted: { type: 'array', items: { type: 'string' }, description: 'M-ids adopted or adapted, e.g. M-2 adapted' },
  sc_targets: { type: 'object', properties: {
    SC1: { type: 'number', description: 'first region head y px at 1440 at rest' },
    SC2: { type: 'number', description: 'condensed header band height px at 1440' },
    SC3: { type: 'number', description: 'condensed lens-line height px, stable across 400 and 1200' },
    SC4: { type: 'number', description: 'rail utilisation percent at 1440 on the project spread' } },
    required: ['SC1', 'SC2', 'SC3', 'SC4'] },
  files_touched_count: { type: 'number', description: 'count of real repo paths named in the engineering path' },
  path: { type: 'string' },
}, required: ['thesis_sentence', 'mechanics_adopted', 'sc_targets', 'files_touched_count', 'path'] }

const AXES = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']
const AXIS_SET = { type: 'object', description: 'seven axes, 1-10 each, never averaged',
  properties: Object.fromEntries(AXES.map(a => [a, { type: 'number' }])), required: AXES }

const CRITIC_SCHEMA = { type: 'object', properties: {
  defects: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string', description: 'Dx-nn' },
    proposal: { type: 'string', enum: ['X', 'Y', 'both'] },
    severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
    confidence: { type: 'number' },
    title: { type: 'string', description: 'max 90 chars' } },
    required: ['id', 'proposal', 'severity', 'confidence', 'title'] } },
  scorecard: { type: 'object', properties: { X: AXIS_SET, Y: AXIS_SET }, required: ['X', 'Y'] },
  path: { type: 'string' },
}, required: ['defects', 'scorecard', 'path'] }

const PLANKS_PATH = OUT + '/source/shared-planks.md'
const X_PATH = OUT + '/source/proposal-x-v1.md'
const Y_PATH = OUT + '/source/proposal-y-v1.md'

phase('Planks')

const planks = await agent(`${PROGRAM}

YOUR SEAT: PLANKS AUTHOR. You are not writing a proposal. You are writing the floor under both of them.

${OPUS_RULES}

Two rival authors are about to draft opposing proposals from this same evidence. Before they start, you fix the moves the evidence FORCES — the ones that are true whatever thesis wins. Both proposals will adopt them identically, and the mockup will draw them identically, so a judge comparing X and Y is comparing theses and not comparing accidents.

THE TEST FOR A PLANK: a plank that could appear in only one proposal is not a plank. If a move only makes sense when the spine is the instrument, or only when the header is, it belongs to that author, not to you. Strike it.

Each plank is numbered SP-01 upward and carries: the move in one sentence · the F-ids from ${OUT}/research/31-verified-findings.md that force it (at least one, and they must exist in that file — read it, do not guess ids) · what it looks like drawn, in one sentence, so both mockups draw it the same way · the one thing it forbids.

EXPECTED, NOT PRESCRIBED — these are where the evidence is loudest. Adopt them if the findings support them, reshape them if the findings say something sharper, and add the ones I have not thought of:
- One region-spacing token. The distinct inter-region gaps today are {6, 29, 56}px: three answers to one question.
- Folded is not empty on sight. A condensed or folded region must be distinguishable from an empty one in a still, with no hover and no expansion.
- Reduced-motion parity as a law, in these words: every behaviour has a still form that says the same thing. Never "n/a", never "no animation".
- Nothing she is reading moves under her. Today the ticket fold is a hard unanimated 283px layout jump at scrollY 280.
- The pre-work gap: four of the seven spreads print zero data-region-head, and the rail is 13.9% ink there. Whatever the rail becomes, it becomes something on the pre-work spreads too.
- Focus is never dropped to the body element. Today folding a region does exactly that.

${KEY_FACTS}

${EVIDENCE}

${CAVEATS}

CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint. Do not price amendments and do not penalise them. Only NG1-NG4 are closed.

${S5_CANON}

OUTPUT RULES
1. Write ${PLANKS_PATH}: a short preamble stating the test for a plank, then one section per plank SP-01 upward in the shape above, then a closing section "What is NOT a plank" naming at least three moves you considered and rejected because they belong to one thesis only, with the thesis they belong to.
2. Aim for the planks the evidence forces and no more — a long list of soft planks removes the argument the two authors are supposed to have. Eight to fourteen is the normal shape.
3. Your final message IS the return value: return only {count, planks} with id, title (max 80 chars) and f_ids (max 5) per plank. Write the full document to ${PLANKS_PATH}.`,
  { label: 'planks author (shared floor)', phase: 'Planks', model: 'opus', effort: 'high', schema: PLANKS_SCHEMA })

if (!planks || !planks.planks || !planks.planks.length) {
  log('Planks author returned nothing — the two authors would have no shared floor. Stopping.')
  return { gate: 'FAIL', reason: 'planks author returned null or empty', planks: null }
}
log(`Shared planks: ${planks.count} — ${planks.planks.map(p => p.id).join(', ')}`)

const AUTHORS = [
  { key: 'X', title: 'the spine is the lens', path: X_PATH, out: 'proposal-x-v1.md',
    seed: `YOUR SEED — X: THE SPINE IS THE LENS. The left rail is the instrument. It is what tracks her depth in the paper and what adjusts what it offers as she descends: position within the whole, each region's extent, which regions carry an exception, distance to the next thing that needs her, where she has already been. The paper's header yields to it — what the letterhead and the job ticket are holding today, the rail holds better, because the rail is true across the whole document at once while the header is only true at the top of it. Today the rail is 54.9% ink on a rich spread and 13.9% on a pre-work spread; it has the room.` },
  { key: 'Y', title: 'the paper is the lens', path: Y_PATH, out: 'proposal-y-v1.md',
    seed: `YOUR SEED — Y: THE PAPER IS THE LENS. The document itself focuses. The header condenses into a living seam that changes what it SAYS as she descends — not a smaller copy of itself, a different sentence at every depth. Sections take and give focus as they enter and leave the frame, so the region she is reading is the one at full density and the others are legible but quiet. The spine simplifies to a quiet ladder: it stops trying to be an instrument and becomes the one thing a ladder is good at.` },
]

const authorPrompt = (a) => `${PROGRAM}

YOUR SEAT: AUTHOR ${a.key} — "${a.title}". You are one of two authors drafting rival proposals from the same evidence. You will never see the other proposal, and the other author will never see yours.

${OPUS_RULES}

${a.seed}

The seed is a starting posture, not an instruction. If the verified findings say your seat's thesis is wrong, say so in one sentence and answer Kody's ask your own way. What you may not do is converge on the other author — if the judges find X and Y are the same proposal in different words, both are returned and re-run.

THE SHARED FLOOR — ${PLANKS_PATH}. Read it in full and adopt every plank IDENTICALLY, in the words and the drawn form it gives. The planks are not yours to argue with; they are the moves the evidence forces regardless of thesis, and both proposals carry them so the judges can compare theses instead of accidents. Cite the SP-ids where your mechanics rest on them. Everything above the floor is your argument.

${KEY_FACTS}

${EVIDENCE}

${CAVEATS}

${CONTRACT}

BRAND VOICE — load ${VOICE_SKILL} and write in it. Patina's document is paper; its language is a studio's language. No product-management English, no "leverage", no "seamlessly", no feature-list voice. Name things the way a designer would say them out loud.

CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint. Do not price amendments and do not penalise them — name what you amend, for the record only. Only NG1-NG4 are closed, and §8 of your document says by what mechanism each stays untouched.

${S5_CANON}

THE TWO AUTOMATIC RETURNS, and only these: (a) any violation of NG1, NG2, NG3 or NG4; (b) any hover-only affordance — any act, state or information available or legible only while a pointer is over an element, at any width, in any lens state. There is NO unpriced-amendment return in this program.

OUTPUT RULES
1. Write your full proposal to ${a.path} — the eleven §6 sections, in order, with those names.
2. The mechanics table has no empty cells and a real reduced-motion FORM in every row. The frame-budget table carries target numbers for SC1-SC4 against 12-layout-measurements.json. The engineering path cites only paths you have ls'd. At least five risks with their falsifying observation, at least four refuses. Every one of M-1 through M-10 named as adopted, adapted or refused.
3. Your final message IS the return value: return only {thesis_sentence, mechanics_adopted, sc_targets, files_touched_count, path}. Write the full document to ${a.path}; never paste it into the return value.`

phase('Draft')

const drafts = (await parallel(AUTHORS.map(a => () =>
  agent(authorPrompt(a), { label: `author ${a.key} — ${a.title}`, phase: 'Draft', model: 'opus', effort: 'high', schema: AUTHOR_SCHEMA })
    .then(r => r ? { key: a.key, ...r } : null)
))).filter(Boolean)

const x = drafts.find(d => d.key === 'X') || null
const y = drafts.find(d => d.key === 'Y') || null
if (!x || !y) {
  log(`Draft gate FAILED — X: ${x ? 'ok' : 'null'}, Y: ${y ? 'ok' : 'null'}. The critique pass needs both proposals.`)
  return { gate: 'FAIL', reason: `author returned null (X: ${x ? 'ok' : 'null'}, Y: ${y ? 'ok' : 'null'})`, planks: planks.count, x, y, critics: [] }
}
log(`X: SC1 ${x.sc_targets.SC1}px, SC4 ${x.sc_targets.SC4}%, ${x.files_touched_count} files · Y: SC1 ${y.sc_targets.SC1}px, SC4 ${y.sc_targets.SC4}%, ${y.files_touched_count} files`)

const STANDING = `THE STANDING ASSIGNMENT — every critic runs it, and it is a section of your file: at s0, s1, s2 and s3, at 1440 and 1280, for BOTH proposals, list everything on screen that is a second copy of something else on screen. The seven facts most likely to appear twice are project identity, stage, the worst exception, the money rung, the install date, the current region's name and the current region's position. A design that quiets the screen by condensing while still printing the same fact in three organs has not answered the ask; it has redecorated it.`

const SCORECARD_RULE = `END WITH THE SEVEN-AXIS SCORECARD, PER PROPOSAL, NEVER AVERAGED — seven numbers 1-10 and one sentence each, for X and for Y. The axes are the ones in ${OUT}/source/rubric.md: a1 uncluttered and peaceful · a2 lens honesty · a3 orientation at depth · a4 engineering credibility · a5 motion discipline · a6 still Patina · a7 the 390 form. Read the anchors at 3, 6 and 9 there and score against them. The scoring verdict belongs to the judges; your scorecard is an input they are free to disagree with in writing.`

const CRITICS = [
  { key: 'C-design', letter: 'Dd', model: 'opus', effort: 'high', file: 'critique-design.md', title: 'design',
    brief: `YOUR BRIEF — C-design.
1. Is this uncluttered, or merely emptier? For every element each proposal removes from a band, say where it went. An element with no named new home is a deletion wearing a lens costume, and a screen that got quiet because a fact left is a failure on axis 1, not a success.
2. Does the lens survive a real Tuesday, or is it a gimmick she fights? Run it against the specimen in ${OUT}/source/specimen.md — the Vandersteen residence, an approval overdue six days, a fabric selection overdue three, PO-2026-0418 unacknowledged fourteen days, a gouged console whose carrier window closes tomorrow, the Byrne agreement never opened. Say per proposal where the mechanism helps her and where she is working around it by the second hour.
3. Is it still Patina paper, or has it become an app that happens to use Playfair? Check the R126 register is intact as a floor and not a starting point for restyling: the type scale, the three rule weights, the stamps, the six tab plates, the ink-pool wash, colour only on small state-carrying things, no large tinted surfaces, the desk block untouched.
4. THE HARDEST QUESTION — where does each proposal add a MECHANISM where a DELETION would do? Name every place a page of choreography is being spent on something that a removed element would have achieved outright. This is the question the program most needs answered, so answer it per proposal, per organ.
5. Where do the ask's "uncluttered" and Patina's "nothing hides" genuinely pull apart in each proposal, and did the author decide, or dodge?` },
  { key: 'C-feasibility', letter: 'Df', model: 'opus', effort: 'high', file: 'critique-feasibility.md', title: 'feasibility',
    brief: `YOUR BRIEF — C-feasibility. You check both proposals against the ACTUAL TREE. Open the files. A verdict without a file:line is not a verdict.
1. Every mechanism in both mechanics tables, checked against the real code with file:line. Where a proposal says a thing is cheap and the tree says otherwise, quote the tree. ${OUT}/research/10-code-anatomy.md and ${OUT}/research/29-panel-e1.md are your map; the source under ${REPO}/apps/designer-portal/src is the territory, and the territory wins.
2. Every test each proposal breaks — INCLUDING THE ONES IT DID NOT NAME. You must OPEN the test files, not cite them from the anatomy: apps/designer-portal/e2e/document/quiet-responsive-shell.spec.ts, apps/designer-portal/src/components/document/__tests__/job-ticket.test.tsx, the responsive-document-shell test, shelved-spine.test.tsx, doc-spine.test.tsx, the region/__tests__ files, and the trap at apps/designer-portal/src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19 — a regex pinning a character budget between data-active-section and the stage-line mount. Say per proposal what happens to that regex. Confirm shadow-gate.test.ts and contrast.test.ts stay green, or say what breaks them.
3. Every dependence on a browser feature — animation-timeline: scroll(), content-visibility, scroll-driven anything — with its support story in the portal's target matrix, its behaviour under prefers-reduced-motion, and the named JS fallback. A dependence with no fallback is a defect.
4. Every place a layout property is animated, or a sticky element's height becomes dynamic, and exactly what shifts as a result. Enumerate every --doc-seam-height consumer each proposal would have to change.
5. Are the §9 waves actually independent? Name every place wave N+1 is required for wave N to be worth shipping — that is a program with a flag on it, not a wave.
6. What do use-region-fold's three voices, the ticket seam, --doc-seam-height and the running-index observer's band and jump lock ACTUALLY BECOME in each proposal? If the answer is missing, vague, or contradicted by the code, that is a defect per proposal.
7. Verify the paths: run ls on every file path each proposal cites in §9. Report every path that does not exist, by proposal, as its own defect.` },
  { key: 'C-practitioner', letter: 'Dp', model: 'opus', effort: 'high', file: 'critique-practitioner.md', title: 'practitioner',
    brief: `YOUR BRIEF — C-practitioner. You are the P1 seat recast: the solo residential principal, six live projects, one always in install, Madison WI, came off Ivy and a Google Sheets FF&E schedule she trusts more than any app. Read ${OUT}/research/25-panel-p1.md first — that is your own earlier walk of the product as it is today, and your job now is to walk the two PROPOSALS.
Walk T1, T3, T4, T7, T9, T10 and T13 (instruments §1) through EACH proposal's mechanics, in first person, present tense, once per proposal, on the specimen data in ${OUT}/source/specimen.md. Per task, exactly this shape and never skipping a line:
  T{n} — {the task in my words}
  First glance:      what my eye lands on in the first 3 seconds, named literally
  Where I'd click:   the exact word or control I'd reach for, and why
  Where I'd hesitate: the moment I stop, and what I'm asking myself
  Where I'd give up:  browser tab / call someone / old tool — or "didn't"
  Frame budget:      of the screen in front of me, what fraction was carrying this task, plus one clause naming what the rest was doing
  Obviousness:       1-5 (1 could not find · 3 second guess · 5 without thinking)
The Frame budget line is mandatory and never skipped. Name your scroll state on every task.
THE TWO DEFECT LAWS:
- Every moment something I needed was not on screen is a defect. Not "a tradeoff" — a defect, numbered, with severity and confidence.
- Every moment the design asks me to REMEMBER that something is there rather than SHOWING me is a defect: recall instead of recognition, numbered the same way.
Also name every place the new design costs me an act that today costs none, and every place a mechanic is doing something to my screen that I did not ask it to do while I was mid-sentence.` },
  { key: 'C-access', letter: 'Da', model: 'sonnet', effort: 'medium', file: 'critique-access.md', title: 'access',
    brief: `YOUR BRIEF — C-access. WCAG 2.2 AA, cited by success criterion NUMBER, against a specific element in a specific proposal at a named state and width. Cover both proposals fully; state and width on every defect.
1. Reduced-motion parity: for EVERY row of each proposal's mechanics table, is the same information on screen with the transit removed? A cell reading "n/a", "none" or "no animation" is a defect on sight. Say which of the twelve existing reduced-motion blocks (${OUT}/research/10-code-anatomy.md) needs a sibling under each proposal.
2. Focus under condensation and unmount: where does the caret go when the thing it is in changes density, and when a body unmounts? Today folding a region drops focus to the body element — say whether each proposal fixes that or inherits it, and name the element focus must land on instead.
3. 2.4.11 focus not obscured (minimum): tab to the first act below the pinned band at each scroll state under each proposal. Is it obscured? Enumerate what a dynamic seam height does to every consumer of --doc-seam-height.
4. 2.4.7 focus visible, under a condensed region's reduced ink weight.
5. 1.4.13 content on hover or focus, and the automatic return: ANY hover-only affordance, at any width, in any lens state, in either proposal. Doctrine says there are none, so verify and report.
6. 2.3.3 animation from interactions: scroll-driven condensation is motion she did not ask for. Is prefers-reduced-motion alone sufficient under each proposal, or is a visible control required? Say which.
7. 1.4.3 contrast: a condensed region's text sits at reduced ink weight. Give the floor value and name the ramp tokens (#4E4339 / #5A4E43 / #65594E) that fail against paper #FCFAF6 and rail stock #E8E3DB, and at what weight the floor is crossed under each proposal.
8. 2.5.8 target size at 390: every target under 24x24, and under 44x44 wherever touch is likely, in each proposal's mobile form.
9. The announcement problem: a region changing density is a state change with NO trigger. Say what a screen reader hears, on what element, via what live-region politeness, and how often before it becomes noise. There is no toast layer — announcements are inline.` },
]

const criticPrompt = (c) => `${PROGRAM}

YOUR SEAT: ${c.key}. You are a critic in a fresh context. You authored neither proposal, and you are not a judge — you do not pick a winner. You find what is wrong with BOTH.

${OPUS_RULES}

${REVIEWER_RULES}

THE TWO PROPOSALS UNDER REVIEW — read both in full before writing anything:
- X — "the spine is the lens": ${X_PATH}
- Y — "the paper is the lens": ${Y_PATH}
Both rest on the shared floor at ${PLANKS_PATH}, which both were required to adopt identically. A plank implemented differently by the two proposals is itself a defect — report it against whichever proposal drifted.

${c.brief}

${STANDING}

${KEY_FACTS}

${EVIDENCE}

${CAVEATS}

CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint. Do NOT price amendments and do NOT penalise them; a critic who deducts for an amendment has made a scoring error. If an amendment is a bad idea, say so on the axis it damages, never on the ground that it amends something.

${S5_CANON}

THE TWO AUTOMATIC RETURNS, and only these: (a) any violation of NG1, NG2, NG3 or NG4; (b) any hover-only affordance. If you find one, say RETURN and name it; do not soften it into a medium.

${SCORECARD_RULE}

OUTPUT RULES
1. Write your full critique to ${OUT}/source/${c.file} — sections: (1) "One line" — max 200 words on the single worst thing about each proposal from this seat; (2) your numbered brief, answered item by item, X and Y each answered under every item; (3) the standing assignment, run at s0/s1/s2/s3 x 1440/1280 for both; (4) every defect written out in full — id ${c.letter}-nn, proposal, severity, confidence, scroll state, width, the proposal section it lands in, the evidence, and the one-line fix; (5) the seven-axis scorecard for X and for Y.
2. Report EVERY defect. 15 to 40 defects across both proposals is normal for a first draft; a short list means you filtered.
3. Your final message IS the return value: return only {defects (id, proposal, severity, confidence, title <= 90 chars), scorecard {X:{a1..a7}, Y:{a1..a7}}, path}. Write the full critique to ${OUT}/source/${c.file}; never paste it into the return value.`

phase('Critique')

const critics = (await parallel(CRITICS.map(c => () =>
  agent(criticPrompt(c), { label: `critic ${c.key}`, phase: 'Critique', model: c.model, effort: c.effort, schema: CRITIC_SCHEMA })
    .then(r => r ? { name: c.key, ...r } : null)
))).filter(Boolean)

const missingCritics = CRITICS.map(c => c.key).filter(k => !critics.some(r => r.name === k))
const defectCount = critics.reduce((n, c) => n + c.defects.length, 0)
log(`Critics returned ${critics.length}/4 (missing: ${missingCritics.join(', ') || 'none'}); ${defectCount} defects — ${critics.map(c => c.name + ':' + c.defects.length).join(' ')}`)

return {
  gate: 'pass',
  planks: { count: planks.count, path: PLANKS_PATH, ids: planks.planks.map(p => p.id) },
  x: { thesis: x.thesis_sentence, sc_targets: x.sc_targets, mechanics: x.mechanics_adopted, files: x.files_touched_count, path: x.path },
  y: { thesis: y.thesis_sentence, sc_targets: y.sc_targets, mechanics: y.mechanics_adopted, files: y.files_touched_count, path: y.path },
  critics: critics.map(c => ({ name: c.name, defects: c.defects, scorecard: c.scorecard, path: c.path })),
}
