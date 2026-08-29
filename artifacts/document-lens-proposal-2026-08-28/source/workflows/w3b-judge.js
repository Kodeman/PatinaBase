export const meta = {
  name: 'document-lens-w3b-judge',
  description: 'W3b: two fresh revisers answer every critic defect and write v2 of each proposal, two judges score the seven axes and each end with an explicit merge instruction, and a third-seat merge author writes the single ratified proposal and the roads not taken',
  phases: [
    { title: 'Revise', detail: 'fresh seats X2 and Y2 answer every numbered defect fix / accept-and-narrow / drop-with-reason and write proposal-x.md and proposal-y.md' },
    { title: 'Judge', detail: 'J1 practitioner-workflow (axes 1,2,3,7) and J2 product and engineering (axes 4,5,6), in parallel, each ending with a merge instruction' },
    { title: 'Merge', detail: 'a third seat — neither author nor judge — writes source/proposal.md to the §6 contract and source/roads-not-taken.md' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const OUT = REPO + '/artifacts/document-lens-proposal-2026-08-28'
const VOICE_SKILL = REPO + '/.claude/skills/patina-brand-voice/SKILL.md'

const ASK = "> \"We are getting close to a design that feels right on the document. The spine on the left is still cluttered and could be better utilized to navigate the ins and outs of the document. The main header contains great info but takes up most of the screen height when opened up, each section is crammed into the next and the margin seems cramped for the space needed for the functionality it contains. Have a team of UI and UX designers sit down with the Patina engineering and interior design teams. Work with them to design the document so that it contains the needed information and actions, while feeling uncluttered and peaceful. Explore animations, content that appears when it needs to and lends to space when it isn't needed in frame. Think of the document as a smart lens that is always adjusting focus on what is needed as the designers move through the document. Present your strongest proposal to achieve this in an html document accompanied with a high fidelity mockup showcasing how the team will accomplish this challenging User experience and UI requirements.\"\n\nThe unit of analysis for every seat in this program is **four scroll states x three widths**: `s0 top` (scrollY 0) · `s1 seam` (the letterhead just gone, the ticket pinned as its two-line seam) · `s2 mid` (the FF&E region head at the top of the frame, under the seam) · `s3 foot` (the Record and colophon in frame); at 1440x900, 1280x800 and 390x844. A finding without a scroll state is out of scope."

const S5_CANON = "## §5 Canon latitude\n\n```\nCANON LATITUDE (2026-08-28, Kody): the ruling ledger docs/design/the-document/DECISIONS.md\n(last id R126) is CONTEXT, not constraint. Amend freely. Do NOT price amendments and do NOT\npenalise them — a refuter labels what a move amends, for the record only. Four hard no-gos\nstand and are not re-proposable:\n  NG1  D1 — one document at a time. No split view, no tabs, no peek/hold, no persistent\n       global nav over an open doc. Esc / Put down is the exit.\n  NG2  D4 shadow budget — exactly one token, --elevation-sheet: 0 1px 2px rgba(44,41,38,.08),\n       at three sites (margin chip, open ledger sheet, studio drawer). Zero other shadows.\n       Mockups, fragments and deck must show 0 box-shadow beyond that token (computed-style\n       sweep, not source grep).\n  NG3  The Thumb Index — removed by Kody, \"do not re-propose\".\n  NG4  The R126 ratified visual register is the FLOOR — 40px Playfair letterhead, 24px Playfair\n       region heads, five-step scale 40/24/18/15/14, mono 11px floor, three rule weights\n       (--rule-hair 1px 10% / --rule-mid 1.5px #2C2926 / --rule-strong 2px + hairline double),\n       paper #FCFAF6, rail stock #E8E3DB, desk #FAF7F2, charcoal #2C2926, the -ink text\n       companions (clay #7C5E30, terracotta #9C5340, golden-hour #79651E, sage #5F6B57), muted\n       ramp #4E4339/#5A4E43/#65594E, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal\n       word, -1.5deg), six saturated stage tab plates (--tab-brief #497093 … --tab-install\n       #823832, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms\n       in / 200ms out, --ease-editorial cubic-bezier(0.22,1,0.36,1), ~1.12:1 over own ground,\n       flat -still tint under reduced motion), 48px product crops on catalog-linked lines.\n       The proposal BUILDS ON this register; it does not restyle it. \"Typography goes no further\n       than the mockup\" (R126). THE STUDIO desk block is untouched.\nKody's taste on record: large tinted surfaces read as \"silly/terrible\"; colour belongs on small\nstate-carrying things; \"the sections and animated highlighting\" were loved; \"don't push the\ntypography further\".\nEverything else — composition, mount order, disclosure, motion, the spine's job, the header's\njob, spacing tokens, what appears when — is open ground.\n```"

const OPUS_RULES = `OPUS BRIEF RULES — deliver exactly what is asked. No unrequested features, no unrequested abstractions, no extra deliverables, no files beyond the ones named in your output rules. Concise and evidence-grounded: every claim carries an F-id, a defect id, a file:line, a measured number, or a quoted line from a document on disk. Prose that carries no evidence is cut.`

const REVIEWER_RULES = `REVIEWER RULES — report EVERY defect and every reservation with severity AND confidence. Never filter by perceived importance and never suppress a low-severity or low-confidence finding; a severity filter costs recall. Number anything new you find Dx-nn in your own letter series. Every point names the scroll state (s0 / s1 / s2 / s3) and the width (1440 / 1280 / 390), and cites the proposal section it lands in.`

const PROGRAM = `You are one agent in "The Document — The Smart Lens" (2026-08-28): a multi-agent design program over the Patina designer portal's document surface, /doc/[id] — one paper per engagement, with its letterhead, its job ticket, its guide sentence, its regions, its left spine and its right margin. Patina connects interior designers with makers of custom furnishings. Nothing in the product is changed by this program; the deliverable is a proposal and a mockup. Repo ${REPO}.

You are in W3b — REVISION, JUDGMENT and MERGE. Two rival proposals (X "the spine is the lens" and Y "the paper is the lens") were drafted from the same verified evidence over a shared floor of planks, and four critics attacked both.

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
- Spine ink is 54.9% of the rail on a rich project spread and 13.9% on a pre-work spread at 1440.
- The set of distinct inter-region gaps is {6, 29, 56}px — three different answers to one question, on one page.
- The ticket fold is a hard, unanimated 283px layout jump at scrollY 280: everything below it moves under her while she is reading.
- Folding a region drops focus to the body element.
- Pre-work documents (brief, discovery, direction, proposal) print zero elements carrying data-region-head.
- Six of the eight job-ticket doors exist only at s0; below the seam they are gone from the paper entirely.`

const EVIDENCE = `INPUTS ON DISK (absolute paths):
- ${OUT}/source/brief.md — the author brief: the four lens laws, the four organs, SC1-SC13, the keeps, the shape delivered.
- ${OUT}/source/rubric.md — the seven axes with anchors at 3, 6 and 9, the two automatic returns, the critic pass, the two judge lenses.
- ${OUT}/source/instruments.md — §1 the task script T1-T16, §2 the personas P1-P4, §6 the proposal contract, §7 the judge rubric, §8 the specimen.
- ${OUT}/source/specimen.md — the Vandersteen residence: the one set of data every proposal and mockup uses.
- ${OUT}/source/mechanics.md — the candidate mechanics catalogue M-1 to M-10 and the conflict summary.
- ${OUT}/source/shared-planks.md — the shared floor both proposals were required to adopt identically.
- ${OUT}/research/31-verified-findings.md and .json — the verified findings, F-ids. The evidence of record.
- ${OUT}/research/30-collated-findings.md — the panel's merged findings and the frame-budget table behind them.
- ${OUT}/research/12-layout-measurements.md and .json — measured rects per document x width x scroll state; every frame-budget number is checked against the JSON.
- ${OUT}/research/10-code-anatomy.md — the shell, the header stack in mount order with file:line, the spine, the margin, the spacing-site table, the motion inventory, the twelve reduced-motion blocks, every --doc-seam-height consumer, the test blast radius.
- ${OUT}/research/11-canon-digest.md — NG1-NG4 verbatim and the R126 register quoted.
- ${OUT}/research/29-panel-e1.md — the engineering feasibility seat: cost bands with file:line for every mechanism a lens could ask for.
- ${OUT}/research/25-panel-p1.md — the P1 walk, T1-T16, with a frame-budget line on every task.
- ${OUT}/probe/03-interactive-probe.md — ticket fold and pin timing, scroll-spy handoff, region unmount and focus destination, the Esc chain, hover-wash timing, the 1280 margin sheet, CLS in both motion registers.
- ${OUT}/research/01-shot-ledger.md — AUTHORITATIVE on which shots exist and which are verified; skip a non-verified shot and say so.
- ${OUT}/shots/ — open images with the Read tool. Minimum set: w1440-rich-s0.png, w1440-rich-s1.png, w1440-rich-s2.png, w1280-rich-s1.png, m390-rich-s1.png, w1440-spine-full.png, w1440-ticket-seam.png, w1440-margin-rail.png. Run ls ${OUT}/shots first.
- ${OUT}/mock/KIT.md — the mockup kit: what the mockup builds from and the probe it must satisfy.
- ${VOICE_SKILL} — the Patina brand voice skill. Load and follow it.`

const CAVEATS = `CAVEATS YOU MUST HONOR
- The seed data behind the shots is synthetic: the rich document has only 3 FF&E lines and 0 rooms. The specimen is the richer world the design must survive; say which way a claim moves on a real 60-line schedule.
- Capture artefact: in fullPage screenshots the fixed bottom Studio Drawer strip lands mid-image at the original viewport-bottom position. That is the harness, not the product. Judge from the viewport shots.
- You cannot click a running app. Where you would need to click to know, say what you EXPECT, cite the anatomy or probe line that says what actually happens, and mark confidence accordingly.`

const CONTRACT = `THE PROPOSAL CONTRACT — instruments.md §6. ELEVEN sections, in this order, with these names. A missing section is a return.
1. Thesis — max 120 words, containing exactly one falsifiable sentence: a claim a measurement in 12-layout-measurements.json or the mockup probe could show to be false. Set it off so a judge finds it first.
2. What stays identical — the R126 register, the tokens, the type scale, the stamps, the tab plates, the wash, the desk block, and every organ not touched.
3. Lens mechanics table — one row per mechanic, columns exactly: trigger · what changes · from-to · duration and easing · reduced-motion equivalent · what never moves · F-ids. NO EMPTY CELLS, and the reduced-motion column is a real FORM (a flat tint, an instant swap, a printed word, a static rule) carrying the same information — never "n/a", never "no animation". from-to carries real values in px, opacity or ink weight.
4. Organ by organ — spine · header · region heads and spacing · margin · motion grammar · the 1180-1439 tier · 390. Each with a before-after and the mount-order consequence in page.tsx's child order.
5. The lens state machine — at rest · reading · editing · condensed · mobile. Per state: the lens line, the rail, each region's density, the margin, the entry trigger, the exit trigger, and the reverse of every transition.
6. Frame budget — a table against 12-layout-measurements.json: today's chrome / header / work split per scroll state x width, and the target. Target numbers are mandatory for at least SC1 (first region head y at 1440 at rest, target <= 405px against today's 1005px), SC2 (condensed header band height at 1440, <= 108px), SC3 (lens-line height at scroll 0 / 400 / 1200, condensed <= 64px and STABLE), SC4 (rail utilisation at 1440, >= 70% project against today's 54.9%, >= 55% pre-work against today's 13.9%).
7. Findings addressed — every verified blocker and high, answered or refused with a reason. Silence is not a refusal.
8. Canon note — what this builds on in R126, and what it changes that an existing ruling describes: NAMED, NOT PRICED. Cite the id, quote at most 25 words, say what it becomes. Then NG1-NG4, each with one sentence saying HOW it stays untouched — a mechanism, not a claim.
9. Engineering path — waves, each valuable on its own. Per wave: the files by REAL path, the mechanism, the tests. Answer explicitly what becomes of (a) use-region-fold's three voices, (b) the ticket seam and every --doc-seam-height consumer, (c) the running-index observer's -20% 0px -62% 0px band and its 700ms jump lock. List every test rewritten or deleted by real path, including the 1500-character regex in apps/designer-portal/src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19. Name the gates that stay green (shadow-gate.test.ts, contrast.test.ts). State the rollback per wave. YOU MUST ls EVERY PATH YOU CITE and correct or delete any that does not exist.
10. Risks — at least FIVE, each with the falsifying observation: what we would see in the first week of building or the first week of use that proves the risk has come true.
11. Refuses — at least FOUR, each with the reason it was refused rather than deferred.`

const CRITIQUES = `THE FOUR CRITIQUES — read all four in full:
- ${OUT}/source/critique-design.md — uncluttered or merely emptier; the Tuesday test on the specimen; still Patina paper; where a mechanism was spent where a deletion would do; the standing duplicate-inventory assignment.
- ${OUT}/source/critique-feasibility.md — every mechanism against the real tree with file:line; every test broken; browser-feature dependence and fallbacks; layout-shift risk; what use-region-fold, the seam variable and the index observer actually become; path verification.
- ${OUT}/source/critique-practitioner.md — the P1 seat recast, walking T1, T3, T4, T7, T9, T10 and T13 through both proposals in first person, with a frame-budget line on every task; every not-on-screen moment and every recall-instead-of-recognition moment as a numbered defect.
- ${OUT}/source/critique-access.md — reduced-motion parity, focus under condensation and unmount, WCAG 2.4.7, 2.4.11, 1.4.13, 2.3.3, 1.4.3, target sizes at 390, and the announcement problem.
Each critique ends with a seven-axis scorecard per proposal (a1 uncluttered and peaceful · a2 lens honesty · a3 orientation at depth · a4 engineering credibility · a5 motion discipline · a6 still Patina · a7 the 390 form), never averaged. The critics' scorecards are an input, not a verdict.`

const X1 = OUT + '/source/proposal-x-v1.md'
const Y1 = OUT + '/source/proposal-y-v1.md'
const X2 = OUT + '/source/proposal-x.md'
const Y2 = OUT + '/source/proposal-y.md'
const MERGED = OUT + '/source/proposal.md'
const ROADS = OUT + '/source/roads-not-taken.md'

const REVISER_SCHEMA = { type: 'object', properties: {
  fixed: { type: 'number', description: 'defects answered with a fix' },
  narrowed: { type: 'number', description: 'defects accepted and narrowed' },
  dropped: { type: 'number', description: 'defects dropped with a reason' },
  path: { type: 'string' },
}, required: ['fixed', 'narrowed', 'dropped', 'path'] }

const axisSet = (axes) => ({ type: 'object', description: 'scored 1-10, never averaged',
  properties: Object.fromEntries(axes.map(a => [a, { type: 'number' }])), required: axes })

const judgeSchema = (axes) => ({ type: 'object', properties: {
  scores: { type: 'object', properties: { X: axisSet(axes), Y: axisSet(axes) }, required: ['X', 'Y'] },
  favoured: { type: 'string', enum: ['X', 'Y', 'neither'] },
  worse_off_persona: { type: 'string', description: 'P1-P4 plus max 160 chars on what they lose, unsoftened' },
  converged: { type: 'boolean', description: 'true when X and Y are the same proposal in different words' },
  merge: { type: 'object', properties: {
    spine: { type: 'string', description: 'source proposal plus max 160 chars: what comes from it and what dies' },
    header: { type: 'string' }, sections: { type: 'string' }, motion: { type: 'string' }, mobile: { type: 'string' } },
    required: ['spine', 'header', 'sections', 'motion', 'mobile'] },
  path: { type: 'string' },
}, required: ['scores', 'favoured', 'worse_off_persona', 'converged', 'merge', 'path'] })

const MERGE_SCHEMA = { type: 'object', properties: {
  title: { type: 'string' },
  thesis_sentence: { type: 'string', description: 'the one falsifiable sentence, max 240 chars' },
  organs: { type: 'object', properties: {
    spine: { type: 'string', description: 'max 200 chars: what it becomes and which proposal it came from' },
    header: { type: 'string' }, sections: { type: 'string' }, margin: { type: 'string' },
    motion: { type: 'string' }, mobile: { type: 'string' } },
    required: ['spine', 'header', 'sections', 'margin', 'motion', 'mobile'] },
  sc_targets: { type: 'object', properties: {
    SC1: { type: 'number' }, SC2: { type: 'number' }, SC3: { type: 'number' }, SC4: { type: 'number' } },
    required: ['SC1', 'SC2', 'SC3', 'SC4'] },
  waves: { type: 'array', items: { type: 'object', properties: {
    n: { type: 'number' }, title: { type: 'string' }, days: { type: 'number' } },
    required: ['n', 'title', 'days'] } },
  roads: { type: 'number', description: 'count of roads not taken written' },
}, required: ['title', 'thesis_sentence', 'organs', 'sc_targets', 'waves', 'roads'] }

const REVISERS = [
  { key: 'X', title: 'the spine is the lens', v1: X1, v2: X2, letter: 'X' },
  { key: 'Y', title: 'the paper is the lens', v1: Y1, v2: Y2, letter: 'Y' },
]

const reviserPrompt = (r) => `${PROGRAM}

YOUR SEAT: REVISER ${r.key}. You are a FRESH seat. You did not write v1 of this proposal, and you are not defending it — you are answering for it. Your loyalty is to proposal ${r.key} — "${r.title}" — and to the evidence, in that order, and where they conflict the evidence wins.

${OPUS_RULES}

YOUR INPUTS
- v1 of your proposal: ${r.v1}. Read it in full. It stays on disk UNTOUCHED — never edit it.
- The shared floor: ${OUT}/source/shared-planks.md. Both proposals adopted it identically and v2 still does. If v1 drifted from a plank, bring it back.
- ${CRITIQUES}
- ${OUT}/source/brief.md and ${OUT}/source/rubric.md — the ask you are answering, and the axes you are answered on.

YOUR JOB
1. Answer EVERY numbered defect addressed to proposal ${r.key} or to "both", from all four critiques. Every one, with no exceptions and no batching of several defects into one line. Three verdicts only:
   - fix — the proposal changes; say what changed and where in v2 it now lives.
   - accept-and-narrow — the defect is real and the mechanic survives in a smaller form; say exactly what got narrower and what it no longer claims.
   - drop-with-reason — the defect does not hold; say why, with evidence (an F-id, a file:line, a measured number, a quoted line from a report). "The critic misunderstood" is not a reason unless you show what they misread.
   These go in a final appendix titled "Critique responses", one row per defect id, in id order, grouped by critic letter, with a count line at the top of each group.
2. Write v2 to ${r.v2}. It keeps the eleven-section §6 contract below, keeps the thesis of ${r.key} (a reviser does not switch theses; if the evidence has killed the thesis, say so in the Thesis section in one sentence and answer the ask your own way inside this seat), and carries every fix through the mechanics table, the state machine, the frame budget and the engineering path so the document stays internally consistent. A fix that appears only in the appendix is not a fix.
3. Do NOT converge on the other proposal. If your fixes would make ${r.key} into the other proposal, that is a signal the thesis lost, and you say so plainly in the Thesis section rather than quietly becoming it.

${CONTRACT}

${KEY_FACTS}

${EVIDENCE}

${CAVEATS}

BRAND VOICE — load ${VOICE_SKILL} and write in it.

CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint. Do not price amendments and do not penalise them. Only NG1-NG4 are closed, and §8 says by what mechanism each stays untouched.

${S5_CANON}

THE TWO AUTOMATIC RETURNS, and only these: (a) any violation of NG1-NG4; (b) any hover-only affordance. If a critic found one, it is fixed in v2, not narrowed.

OUTPUT RULES
1. Write v2 to ${r.v2} — the eleven §6 sections in order, plus the "Critique responses" appendix. ${r.v1} is not edited.
2. Every path cited in §9 must be ls'd first; correct or delete any that does not exist.
3. Your final message IS the return value: return only {fixed, narrowed, dropped, path}. Write the full document to ${r.v2}; never paste it into the return value.`

phase('Revise')

const revised = (await parallel(REVISERS.map(r => () =>
  agent(reviserPrompt(r), { label: `reviser ${r.key} — ${r.title}`, phase: 'Revise', model: 'opus', effort: 'high', schema: REVISER_SCHEMA })
    .then(v => v ? { key: r.key, ...v } : null)
))).filter(Boolean)

const missingRevisers = REVISERS.map(r => r.key).filter(k => !revised.some(v => v.key === k))
if (missingRevisers.length) {
  log(`Reviser gate FAILED — missing ${missingRevisers.join(', ')}. The judges need both v2 proposals.`)
  return { gate: 'FAIL', reason: `reviser returned null (missing ${missingRevisers.join(', ')})`, revisers: revised, judges: [], merge: null }
}
log(`Revisers: ${revised.map(v => `${v.key} fixed ${v.fixed} / narrowed ${v.narrowed} / dropped ${v.dropped}`).join(' · ')}`)

const JUDGE_COMMON = `THE TWO PROPOSALS UNDER JUDGMENT — the v2 documents, and only these:
- X — "the spine is the lens": ${X2}
- Y — "the paper is the lens": ${Y2}
Read BOTH in full, including each one's "Critique responses" appendix. The v1 drafts (${X1}, ${Y1}) are context if you need to see what a reviser changed; the v2 documents are what you score.

${CRITIQUES}

NEVER AVERAGE. A proposal is a shape, not a number; an average would let a 9 on motion discipline pay for a 3 on lens honesty, and those are not convertible currencies. Report the shape: a number per axis and one sentence saying why that number and not the one above it, anchored against the 3 / 6 / 9 anchors in ${OUT}/source/rubric.md. A 10 is reserved for an answer that changes what the team thinks is possible on that axis, and a judge awarding one says what it taught them.

THE TWO AUTOMATIC RETURNS, and only these: (a) any violation of NG1, NG2, NG3 or NG4; (b) any hover-only affordance, at any width, in any lens state. There is NO unpriced-amendment return in this program: under the canon latitude, DECISIONS.md is context and amendments are never priced and never penalised. A judge who deducts for an amendment has made a scoring error. If an amendment is a bad idea, say so on the axis it damages, never on the ground that it amends something.

CONVERGENCE CHECK — run it before you score, and answer it in its own section. The two authors were forbidden to converge. If X and Y are the same proposal in different words — same organs doing the same jobs by the same mechanisms, differing only in vocabulary and emphasis — say CONVERGED, set converged true in your return value, and explain in that section exactly which organs are identical and what each author's thesis was supposed to have made different. If they are genuinely rival, say so and name the sharpest single disagreement between them.

YOU END WITH TWO THINGS, IN THIS ORDER:
1. WHO IS WORSE OFF. Name the persona (P1 solo residential principal · P2 principal of a three-person studio · P3 junior designer week one · P4 FF&E and procurement) who LOSES under the proposal you favour, say what they lose, and do not soften it. Every real design decision costs somebody something; a judge who cannot name the loser has not understood the proposal.
2. AN EXPLICIT MERGE INSTRUCTION. Not "combine the best of both". A list of organs — spine · header · sections and margin · motion · 390 — each with the proposal it comes FROM, what specifically comes from it, and WHAT DIES: the thing in the other proposal that does not survive the merge, named. The merge author works from these instructions and is entitled to disagree only in writing.`

const JUDGES = [
  { key: 'J1', axes: ['a1', 'a2', 'a3', 'a7'], file: 'judge-practitioner.md', title: 'practitioner and workflow',
    brief: `YOUR LENS: J1 — PRACTITIONER AND WORKFLOW. You score axes 1 (uncluttered and peaceful), 2 (lens honesty), 3 (orientation at depth) and 7 (the 390 form) — a1, a2, a3, a7 — for X and for Y.

EVERY SCORE NAMES THE PERSONA BEHIND IT: which of P1, P2, P3 or P4 (instruments §2) is speaking when the score is what it is, and on which of T1-T16. A score with no persona attached is not a score, it is an opinion. Read ${OUT}/research/25-panel-p1.md and instruments §2 before scoring.

THE OBVIOUSNESS WALK — mandatory, and its own section. Walk T1 through T16 (instruments §1) through EACH proposal's mechanics on the specimen data in ${OUT}/source/specimen.md, and give per task, per proposal: the act count to the door, the scroll state the door lives at under the proposal, and an obviousness score 1-5 (1 could not find · 3 second guess · 5 without thinking). Two tables, sixteen rows each. Then name every task that is WORSE than today under either proposal — that alone lands axis 3 at 3.

Score axis 1 against measured numbers, not adjectives: does the frame budget actually move, in the table, against 12-layout-measurements.json, and did the screen get quiet because something found a new home or because a fact was deleted? Score axis 2 on the honesty law: every condensation reversible in one act, readable without hover, distinguishable from empty in a STILL, with the <= 40-character condensed line specified per region and the folded-by-choice versus condensed-by-position collision ruled. Score axis 7 on whether 390 is the same lens in one column that PROVES the thesis, or a shorter product that survives it.` },
  { key: 'J2', axes: ['a4', 'a5', 'a6'], file: 'judge-feasibility.md', title: 'product and engineering',
    brief: `YOUR LENS: J2 — PRODUCT AND ENGINEERING. You score axes 4 (engineering credibility), 5 (motion discipline) and 6 (still Patina) — a4, a5, a6 — for X and for Y.

EVERY COST CLAIM CITES A FILE — a real path, and a line where the line is what makes the point. "This is expensive" without a file is struck from your own verdict. ${OUT}/research/29-panel-e1.md carries the engineering seat's cost bands; the source under ${REPO}/apps/designer-portal/src is the territory, and the territory wins.

PATH VERIFICATION — mandatory, and its own section: run ls on EVERY file path each proposal's §9 engineering path cites. Report, per proposal, the count of paths cited, the count that exist, and every path that does not, by name. A proposal citing paths that do not exist cannot score above 3 on axis 4, and you say so.

Score axis 4 against the anchors: are the waves independent and individually valuable, in real paths; are all three load-bearing mechanisms answered explicitly — what use-region-fold's three voices BECOME, what the ticket seam and every --doc-seam-height consumer BECOME, what the running-index observer's -20% 0px -62% 0px band and 700ms jump lock BECOME; is the test blast radius enumerated file by file with rewrite-or-delete and a reason, including the 1500-character regex in apps/designer-portal/src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19; are shadow-gate.test.ts and contrast.test.ts shown green; is rollback stated per wave; does any browser-feature dependence carry a named JS fallback and a support statement.
Score axis 5 on the grammar table: every column filled, every reduced-motion cell a real FORM carrying the same information, hysteresis stated with two numbers and the distance between them, zero layout shift claimed WITH the mechanism that delivers it, the one-ambient-move budget defended, momentum and reverse-scroll ruled separately.
Score axis 6 on the R126 register as a floor: nothing restyled, no further type, no second icon language, no large tinted surface, colour only on small state-carrying things, the desk block untouched, and the new organs looking like they were always there.` },
]

const judgePrompt = (j) => `${PROGRAM}

YOUR SEAT: ${j.key} — ${j.title}. You are a judge. You authored neither proposal, you did not revise either, and you have not seen the other judge's verdict.

${OPUS_RULES}

${REVIEWER_RULES}

${j.brief}

${JUDGE_COMMON}

${KEY_FACTS}

${EVIDENCE}

${CAVEATS}

CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint.

${S5_CANON}

OUTPUT RULES
1. Write your full judgment to ${OUT}/source/${j.file} — sections: (1) "One line" — max 200 words on what each proposal is, in your own words, said fairly enough that its author would recognise it; (2) the convergence check; (3) your scores, one section per axis (${j.axes.join(', ')}), X and Y each with a number, the anchor it sits against, and the evidence — ${j.key === 'J1' ? 'the persona and the task behind every score' : 'a file path or a test behind every cost claim'}; (4) ${j.key === 'J1' ? 'the T1-T16 obviousness walk, two tables' : 'the path-verification section, per proposal'}; (5) "Who is worse off"; (6) "Merge instruction" — organ by organ, with the source proposal and what dies.
2. Never average. Report the shape.
3. Your final message IS the return value: return only {scores {X, Y}, favoured, worse_off_persona, converged, merge {spine, header, sections, motion, mobile}, path}. Write the full judgment to ${OUT}/source/${j.file}; never paste it into the return value.`

phase('Judge')

const judged = (await parallel(JUDGES.map(j => () =>
  agent(judgePrompt(j), { label: `judge ${j.key} — ${j.title}`, phase: 'Judge', model: 'opus', effort: 'high', schema: judgeSchema(j.axes) })
    .then(v => v ? { key: j.key, ...v } : null)
))).filter(Boolean)

const missingJudges = JUDGES.map(j => j.key).filter(k => !judged.some(v => v.key === k))
if (missingJudges.length) {
  log(`Judge gate FAILED — missing ${missingJudges.join(', ')}. The merge author needs both judgments.`)
  return { gate: 'FAIL', reason: `judge returned null (missing ${missingJudges.join(', ')})`, revisers: revised, judges: judged, merge: null }
}

const converged = judged.filter(j => j.converged)
log(`Judges: ${judged.map(j => `${j.key} favours ${j.favoured}, worse off ${j.worse_off_persona}`).join(' · ')}`)
if (converged.length) {
  log(`!!! CONVERGENCE DECLARED by ${converged.map(j => j.key).join(' and ')} — X and Y are the same proposal in different words.`)
  log('!!! W3a must be RE-RUN with sharpened seeds. Do NOT merge two copies of one proposal; the merge would ratify an argument that never happened.')
  converged.forEach(j => log(`!!! ${j.key} convergence verdict is in ${j.path} — read its convergence-check section for the organs it found identical.`))
  return {
    gate: 'FAIL',
    reason: `CONVERGED — ${converged.map(j => j.key).join(' and ')} report X and Y are the same proposal in different words; re-run W3a with sharpened seeds`,
    revisers: revised,
    judges: judged.map(j => ({ key: j.key, scores: j.scores, favoured: j.favoured, worse_off_persona: j.worse_off_persona, converged: j.converged, merge: j.merge, path: j.path })),
    merge: null,
  }
}

phase('Merge')

const merge = await agent(`${PROGRAM}

YOUR SEAT: MERGE AUTHOR — a THIRD seat. You are neither author nor judge. You did not write X, you did not write Y, you did not revise either, and you did not score either. You are the seat that writes the one proposal Patina builds from, and your loyalty is to the evidence and to the two judges' merge instructions.

${OPUS_RULES}

YOUR INPUTS — read all of them in full before writing a line:
- ${X2} — proposal X v2, "the spine is the lens".
- ${Y2} — proposal Y v2, "the paper is the lens".
- ${OUT}/source/judge-practitioner.md — J1, axes 1/2/3/7, the T1-T16 obviousness walk, who is worse off, and an explicit merge instruction.
- ${OUT}/source/judge-feasibility.md — J2, axes 4/5/6, path verification, who is worse off, and an explicit merge instruction.
- ${CRITIQUES}
- ${OUT}/source/shared-planks.md — the shared floor; every plank survives the merge, in its identical drawn form.
- ${OUT}/research/31-verified-findings.md — the evidence of record. Every mechanic in your document traces to an F-id or to a quoted judge line.
- ${OUT}/research/29-panel-e1.md — the engineering seat's cost bands with file:line. Your §9 agrees with it or says where it disagrees and why.
- ${OUT}/source/brief.md — the ask you are answering. ${OUT}/source/rubric.md — the axes it will be scored on. ${OUT}/source/specimen.md — the Vandersteen data every section and the mockup use.

HOW YOU MERGE
1. The judges' merge instructions are your instruction set: organ by organ — spine · header · sections and margin · motion · 390 — each comes from the proposal a judge named, and what a judge said dies, dies. Where J1 and J2 disagree about an organ, you rule, and you say in one sentence why, naming both instructions. You are entitled to disagree with a judge only IN WRITING, in a short subsection saying which instruction you overrode and on what evidence.
2. ONE proposal. No hedging, no "option A or B", no "either the rail or the seam could carry this", no parenthetical alternative left for someone else to pick. Every mechanic is ratified: it is in, at a stated value, or it is not in the document at all.
3. Every mechanic is traceable: each row of the mechanics table cites an F-id from 31-verified-findings, or a quoted line from a judgment or critique that put it there. A mechanic with no trace does not go in.
4. Every plank from the shared floor survives, identically.
5. The engineering path cites only real paths: run ls on EVERY path before it goes in §9, and correct or delete any that does not exist.

${CONTRACT}

${KEY_FACTS}

${EVIDENCE}

${CAVEATS}

BRAND VOICE — load ${VOICE_SKILL} and write in it. This is the document Kody reads. Patina's paper, a studio's language: no product-management English, no feature-list voice.

CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint. Do not price amendments and do not penalise them — name what you amend, for the record only. Only NG1-NG4 are closed, and §8 says by what mechanism each stays untouched.

${S5_CANON}

THE TWO AUTOMATIC RETURNS, and only these: (a) any violation of NG1-NG4; (b) any hover-only affordance at any width in any lens state.

OUTPUT RULES
1. Write ${MERGED} — the eleven §6 sections, in order, with those names: the single ratified proposal.
2. Write ${ROADS} — "Roads not taken", 4 to 8 roads. Per road, four things and no more: THE ROAD (what it was, in one paragraph a reader can picture) · WHY IT WAS ATTRACTIVE (the real case for it, made honestly enough that a reader feels the loss) · THE ONE THING THAT KILLED IT (one thing, not a list) · WHO KILLED IT (the critic or judge, named — C-design, C-feasibility, C-practitioner, C-access, J1 or J2 — with their line quoted, at most 40 words, and its defect id or section). A road with no named killer is not a road, it is a preference.
3. Your final message IS the return value: return only {title, thesis_sentence, organs, sc_targets, waves, roads}. Write the full documents to ${MERGED} and ${ROADS}; never paste them into the return value.`,
  { label: 'merge author (third seat)', phase: 'Merge', model: 'opus', effort: 'high', schema: MERGE_SCHEMA })

if (!merge) {
  log('Merge author returned null — there is no ratified proposal. Stopping.')
  return {
    gate: 'FAIL',
    reason: 'merge author returned null',
    revisers: revised,
    judges: judged.map(j => ({ key: j.key, scores: j.scores, favoured: j.favoured, worse_off_persona: j.worse_off_persona, converged: j.converged, merge: j.merge, path: j.path })),
    merge: null,
  }
}
log(`Merged: "${merge.title}" — ${merge.waves.length} waves, ${merge.roads} roads not taken; SC1 ${merge.sc_targets.SC1}px, SC4 ${merge.sc_targets.SC4}%`)

return {
  gate: 'pass',
  revisers: revised,
  judges: judged.map(j => ({ key: j.key, scores: j.scores, favoured: j.favoured, worse_off_persona: j.worse_off_persona, converged: j.converged, merge: j.merge, path: j.path })),
  merge: { ...merge, path: MERGED, roads_path: ROADS },
}
