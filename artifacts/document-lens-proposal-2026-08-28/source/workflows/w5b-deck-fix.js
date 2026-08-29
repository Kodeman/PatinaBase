export const meta = {
  name: 'document-lens-w5b-deck-fix',
  description: 'W5b: up to four part fixers apply the fact-check and visual-QA findings to their own part file and nothing else, then the same runner rebuilds presentation.html and re-renders the QA sweep; Fable loops this with fresh args until zero Blocking and zero UNSOURCED',
  phases: [
    { title: 'Fix', detail: 'one agent per fix entry (at most four), each applying exactly the listed items to exactly one part file, at the model the entry names' },
    { title: 'Rebuild', detail: 'the same build and QA runner as W5a — build.mjs then qa-run.cjs, both unsandboxed' },
  ],
}

const REPO = '/Users/kody/Code/patina-merged'
const OUT = REPO + '/artifacts/document-lens-proposal-2026-08-28'
const DECK = OUT + '/mock/deck-parts'

const S5_CANON = "## §5 Canon latitude\n\n```\nCANON LATITUDE (2026-08-28, Kody): the ruling ledger docs/design/the-document/DECISIONS.md\n(last id R126) is CONTEXT, not constraint. Amend freely. Do NOT price amendments and do NOT\npenalise them — a refuter labels what a move amends, for the record only. Four hard no-gos\nstand and are not re-proposable:\n  NG1  D1 — one document at a time. No split view, no tabs, no peek/hold, no persistent\n       global nav over an open doc. Esc / Put down is the exit.\n  NG2  D4 shadow budget — exactly one token, --elevation-sheet: 0 1px 2px rgba(44,41,38,.08),\n       at three sites (margin chip, open ledger sheet, studio drawer). Zero other shadows.\n       Mockups, fragments and deck must show 0 box-shadow beyond that token (computed-style\n       sweep, not source grep).\n  NG3  The Thumb Index — removed by Kody, \"do not re-propose\".\n  NG4  The R126 ratified visual register is the FLOOR — 40px Playfair letterhead, 24px Playfair\n       region heads, five-step scale 40/24/18/15/14, mono 11px floor, three rule weights\n       (--rule-hair 1px 10% / --rule-mid 1.5px #2C2926 / --rule-strong 2px + hairline double),\n       paper #FCFAF6, rail stock #E8E3DB, desk #FAF7F2, charcoal #2C2926, the -ink text\n       companions (clay #7C5E30, terracotta #9C5340, golden-hour #79651E, sage #5F6B57), muted\n       ramp #4E4339/#5A4E43/#65594E, filled stamps (~1.18:1 tint, 1.5px pigment border, charcoal\n       word, -1.5deg), six saturated stage tab plates (--tab-brief #497093 … --tab-install\n       #823832, white label), the ink-pool hover wash (clip-path circle from the pointer, 260ms\n       in / 200ms out, --ease-editorial cubic-bezier(0.22,1,0.36,1), ~1.12:1 over own ground,\n       flat -still tint under reduced motion), 48px product crops on catalog-linked lines.\n       The proposal BUILDS ON this register; it does not restyle it. \"Typography goes no further\n       than the mockup\" (R126). THE STUDIO desk block is untouched.\nKody's taste on record: large tinted surfaces read as \"silly/terrible\"; colour belongs on small\nstate-carrying things; \"the sections and animated highlighting\" were loved; \"don't push the\ntypography further\".\nEverything else — composition, mount order, disclosure, motion, the spine's job, the header's\njob, spacing tokens, what appears when — is open ground.\n```"

const FIXES = args && Array.isArray(args.fixes) ? args.fixes.slice(0, 4) : []
const ROUND = args && args.round ? args.round : 1

const PROGRAM = `You are one agent in "The Document — The Smart Lens" (2026-08-28): a multi-agent design program on the Patina designer portal's document surface, /doc/[id] — one paper per engagement, with its letterhead, its job ticket, its guide sentence, its regions, its left spine and its right margin. Patina connects interior designers with makers of custom furnishings. Nothing in the product is changed by this program; the deliverables are one proposal, one clickable mockup and one deck. Repo ${REPO}. Program folder ${OUT}.

You are in W5b — THE DECK FIX WAVE, round ${ROUND}. The deck "The Smart Lens" is assembled from seventeen files in ${DECK} and built into ${OUT}/presentation.html. A fact-checker (${OUT}/research/60-deck-factcheck.md) and a visual-QA seat (${OUT}/research/61-deck-visualqa.md) attacked the built page; the orchestrator has read both and handed you the items to fix.

HARD RULES
1. Durable path: edit only the exact absolute path your brief names. The orchestrator reads the FILE. Never write to /tmp or a scratchpad.
2. Forbidden: git add / commit / stash / push; editing anything under ${REPO}/apps, ${REPO}/packages, ${REPO}/supabase or ${REPO}/docs; starting or stopping dev servers; editing 00-head.html, 99-script.html, build.mjs, qa-run.cjs, kit.css, lens.css, any fragment under ${OUT}/mock/fragments, or any part file other than your own.
3. Never invent a number, a label, a quote, a file path or a finding id. Everything printed in this deck traces to a file on disk under ${OUT}/research, ${OUT}/source, ${OUT}/probe or ${OUT}/mock. If a fix asks for a figure no file carries, do not invent it — skip that item and say why.
4. Quote labels and copy verbatim — exact case, exact middots, exact punctuation.
5. Your final message IS the return value. Return ONLY the compact structured summary the schema asks for — never the file contents, never prose around it.`

const CANON = `CANON LATITUDE — instruments.md §5, verbatim. The ruling ledger is CONTEXT, not constraint; amendments are never priced and never penalised. Only NG1-NG4 are closed, and two of them bind this deck's own markup as well as the design it argues: NG2 (zero box-shadow beyond the one token — the build fails on any) and NG4 (the R126 register is the floor, and the deck neither restyles it nor pushes the typography further).

${S5_CANON}`

const CONTRACT = `THE AUTHORING CONTRACT still binds every character you touch — read ${DECK}/DECK.md IN FULL before you edit: the exact id, index title, eyebrow and register for your section (§1); the section shape and every type and grid class (§2); the two registers (§3); the FRAGMENT marker syntax (§4); the <img data-shot="FILE.png"> syntax and the .lvl chips (§5); F-chips and .voice quotes (§6); tables inside .dk-tablewrap (§7); voice (§8); the budget (§9); the checklist (§10).

ALSO READ and follow ${REPO}/.claude/skills/patina-brand-voice/SKILL.md. Understatement. No exclamation marks. No emoji, ever. Never "users said", "designers told us", "research shows", or any count of people. Never elevated, curated, luxury, bespoke, seamless, effortless, delight, magical, unlock or delightful.

STILL NON-NEGOTIABLE
- One <section>, opened and closed in your file, keeping the exact id, class and data-index-title it already has. Do not rename the section, do not change its register, do not move it.
- No <style>, no <script>, no inline font-size, colour or margin. If a fix needs a class that does not exist, do not invent one inline: skip that item and name the class you needed in skipped_with_reason.
- ZERO box-shadow and ZERO drop-shadow( — the build hard-fails on either.
- Under 30 000 characters, at most 5 fragments, at most 8 shots.
- Every F## must resolve in ${OUT}/research/31-verified-findings.md with the title that file gives it. Every fragment must exist under ${OUT}/mock/fragments (ls it). Every shot must exist under ${OUT}/shots and be verified in ${OUT}/research/01-shot-ledger.md.
- DO NOT RUN build.mjs OR qa-run.cjs. Several fixers may be editing in parallel and a concurrent build would race on presentation.html. The runner builds after you all return.`

const fixPrompt = (f) => `${PROGRAM}

${CANON}

${CONTRACT}

YOUR PART: ${DECK}/${f.part} — and that file ONLY. You do not touch any other part, and you do not fix anything you were not given, however tempting.

READ IT FIRST, in full. Then read whatever source you need to make the change true: ${OUT}/research/31-verified-findings.md for findings and F-ids, ${OUT}/research/12-layout-measurements.md for measurements, ${OUT}/probe/03-interactive-probe.md for probe facts, ${OUT}/research/10-code-anatomy.md for code claims, ${OUT}/source/proposal.md for mechanics values (verbatim, no rounding), ${OUT}/source/plan.md for the ask and the census, ${OUT}/mock/final/FINAL.md and REVIEW-2.md for what the mockup does, ${OUT}/research/60-deck-factcheck.md and ${OUT}/research/61-deck-visualqa.md for the full text of the findings summarised below.

APPLY EXACTLY THESE ITEMS, all of them, and nothing beyond them:
${f.items.map((s, i) => (i + 1) + '. ' + s).join('\n')}

RULES FOR THE EDIT
- Apply every item, or say precisely why you did not. An item you skip goes into skipped_with_reason with the reason — never silently dropped, never silently reinterpreted.
- Change the smallest amount of markup that resolves the item. Do not rewrite passages the items did not name, do not restructure the section, do not "improve" prose that was not flagged, do not add a figure, a table or a fragment that no item asked for.
- If an item is wrong — the deck already says the right thing, or the source disagrees with the item — do not force it. Skip it and say so, citing the file and the line that settles it.
- After editing, run wc -c on the file, grep it for box-shadow and drop-shadow( (both must return nothing), and grep it for font-size, color: and margin inside a style attribute (must return nothing).

Your final message IS the return value: return ONLY {part, applied, skipped_with_reason, chars} — applied is one short string per item you applied (at most 160 characters each), skipped_with_reason one string per item you did not apply, naming the item and the reason. Never paste the HTML.`

const FIX_SCHEMA = { type: 'object', properties: {
  part: { type: 'string' },
  applied: { type: 'array', items: { type: 'string', description: 'max 160 chars' } },
  skipped_with_reason: { type: 'array', items: { type: 'string', description: 'max 200 chars' } },
  chars: { type: 'number', description: 'wc -c of the file after the edit' } },
  required: ['part', 'applied', 'skipped_with_reason', 'chars'] }

const QA_SCHEMA = { type: 'object', properties: {
  externalRequests: { type: 'number' },
  pageErrors: { type: 'number' },
  consoleErrors: { type: 'number' },
  overflow: { type: 'number' },
  mocksFit: { type: 'boolean' },
  fontsLoaded: { type: 'boolean' },
  indexRows: { type: 'number' },
  contrastFails: { type: 'number' },
  boxShadowSweep: { type: 'number' } },
  required: ['externalRequests', 'pageErrors', 'consoleErrors', 'overflow', 'mocksFit', 'fontsLoaded', 'indexRows', 'contrastFails', 'boxShadowSweep'] }

const BUILD_SCHEMA = { type: 'object', properties: {
  build_exit: { type: 'number' },
  parts: { type: 'number' },
  fragments: { type: 'number' },
  shots: { type: 'number' },
  box_shadow: { type: 'number' },
  non_ascii: { type: 'number' },
  size_mb: { type: 'number' },
  qa: QA_SCHEMA,
  summary: { type: 'string', description: 'max 400 chars: the first real problem, or the word clean' } },
  required: ['build_exit', 'parts', 'fragments', 'shots', 'box_shadow', 'non_ascii', 'size_mb', 'qa', 'summary'] }

const RUNNER = `${PROGRAM}

${CANON}

YOUR ROLE: BUILD RUNNER, round ${ROUND}. The fixers have edited their part files in ${DECK}. Rebuild the deck and re-render the QA sweep. You do not author and you do not fix.

1. Run these two commands, EACH AS ITS OWN Bash call, with dangerouslyDisableSandbox: true on both — build.mjs shells out to sips, which writes a scratch file into the system temp directory, and qa-run.cjs launches headless Chromium, which cannot claim its mach port inside the sandbox:
     cd ${OUT} && node mock/deck-parts/build.mjs
     cd ${OUT} && node mock/deck-parts/qa-run.cjs
   Capture each command's full stdout. If build.mjs exits non-zero: DO NOT edit any part file, DO NOT run qa-run.cjs, report build_exit with the failing line in summary, report every other number as -1, and go straight to step 4. Another fix round owns repairs; you own the truth about what happened.
2. Parse build.mjs's summary block for: PARTS (parts concatenated) into parts; FRAGMENTS (inlined) into fragments; SHOTS (embedded) into shots; the box-shadow / drop-shadow gate result into box_shadow (the count it reports, 0 when the gate passed); the ASCII line's non-ascii bytes left into non_ascii; and the SIZE line, in MB, into size_mb.
3. Read ${OUT}/mock/deck-qa/qa-results.json and aggregate ACROSS EVERY entry in its "passes" object — there is one per viewport and theme (1440-light, 1440-dark, 390-light, 390-dark and any others present):
     externalRequests = the length of the top-level externalRequests array
     pageErrors       = the length of the top-level pageErrors array
     consoleErrors    = the length of the top-level consoleErrors array
     overflow         = the total number of overflowers summed across every pass
     mocksFit         = true only if, in every pass, no mock has fitsParent false and no mock has pastViewport true
     fontsLoaded      = true only if, in every pass, fontsStatus is loaded and the fonts array is non-empty
     indexRows        = the index.rows figure, reported as the MINIMUM across passes; it should equal index.sectionsWithTitle, and there are fifteen sections
     contrastFails    = the total number of contrast samples whose ratio is below 4.5, summed across every pass
     boxShadowSweep   = the total number of entries in "shadowed", summed across every pass
   Report the raw numbers you actually read. Never round and never estimate. If a field is genuinely absent from the JSON, report -1 for it and name it in summary.
4. Append to ${OUT}/research/00-env-and-ids.md a section headed exactly:
     ## Commands run unsandboxed (deck)
   listing verbatim every command you ran with the sandbox off, its exit code, and one line saying what it did and why it needed the sandbox off. If that heading is already in the file, append your entries beneath it — under a "round ${ROUND}" line — rather than adding a second copy.
5. Your final message IS the return value: return ONLY {build_exit, parts, fragments, shots, box_shadow, non_ascii, size_mb, qa:{externalRequests, pageErrors, consoleErrors, overflow, mocksFit, fontsLoaded, indexRows, contrastFails, boxShadowSweep}, summary}. summary is at most 400 characters and names the first real problem, or the single word clean. Never paste the build log.`

if (!FIXES.length) {
  log('No fixes given — pass args = {fixes:[{part, model, items:[...]}], round:n}')
  return { gate: 'FAIL', reason: 'no fixes given in args.fixes', round: ROUND, fixes: [], build: null }
}

log(`Round ${ROUND}: ${FIXES.length} part(s) to fix — ${FIXES.map(f => f.part + ' (' + (f.model || 'sonnet') + ', ' + (f.items ? f.items.length : 0) + ' items)').join(' · ')}`)

phase('Fix')
const fixed = (await parallel(FIXES.map(f => () =>
  agent(fixPrompt({ part: f.part, items: Array.isArray(f.items) ? f.items : [] }), {
    label: `fix:${f.part} (round ${ROUND})`,
    phase: 'Fix',
    model: f.model || 'sonnet',
    effort: f.model === 'opus' ? 'high' : f.model === 'haiku' ? 'low' : 'medium',
    schema: FIX_SCHEMA,
  }).then(r => r ? { requested: Array.isArray(f.items) ? f.items.length : 0, ...r } : { part: f.part, applied: [], skipped_with_reason: ['fixer returned nothing — agent died'], chars: -1, requested: Array.isArray(f.items) ? f.items.length : 0 })
))).filter(Boolean)

const appliedTotal = fixed.reduce((n, f) => n + (f.applied ? f.applied.length : 0), 0)
const skippedTotal = fixed.reduce((n, f) => n + (f.skipped_with_reason ? f.skipped_with_reason.length : 0), 0)
log(`Fix: ${appliedTotal} items applied, ${skippedTotal} skipped across ${fixed.length} part(s)`)
fixed.forEach(f => { if (f.skipped_with_reason && f.skipped_with_reason.length) log(`SKIPPED in ${f.part}: ${f.skipped_with_reason.join(' | ')}`) })

phase('Rebuild')
const build = await agent(RUNNER, { label: `rebuild + qa (round ${ROUND}, unsandboxed)`, phase: 'Rebuild', model: 'sonnet', effort: 'low', schema: BUILD_SCHEMA })
if (!build) {
  log('Build runner died — no build result')
  return { gate: 'FAIL', reason: 'build runner returned nothing', round: ROUND, fixes: fixed, build: null }
}
log(`Build: exit ${build.build_exit} · ${build.parts} parts · ${build.fragments} fragments · ${build.shots} shots · ${build.size_mb} MB · box-shadow ${build.box_shadow} · non-ascii ${build.non_ascii}`)
log(`QA: ext ${build.qa.externalRequests} · pageErr ${build.qa.pageErrors} · consoleErr ${build.qa.consoleErrors} · overflow ${build.qa.overflow} · mocksFit ${build.qa.mocksFit} · fonts ${build.qa.fontsLoaded} · idxRows ${build.qa.indexRows} · contrast ${build.qa.contrastFails} · shadow ${build.qa.boxShadowSweep}`)

const qa = build.qa
const gate = (build.build_exit === 0 &&
  qa.externalRequests === 0 && qa.pageErrors === 0 && qa.consoleErrors === 0 &&
  qa.overflow === 0 && qa.contrastFails === 0 && qa.boxShadowSweep === 0 &&
  qa.mocksFit === true && qa.fontsLoaded === true && qa.indexRows === 15) ? 'pass' : 'FAIL'
log(`GATE ${gate} after round ${ROUND} — re-run the fact-check and visual QA before calling the deck done`)

return {
  gate,
  round: ROUND,
  fixes: fixed.map(f => ({ part: f.part, requested: f.requested, applied: f.applied, skipped_with_reason: f.skipped_with_reason, chars: f.chars })),
  build,
}
