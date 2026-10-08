export const meta = {
  name: 'marketing-draft',
  description: 'The Press, phase A: brief to judged, linted copy and a Midjourney prompt pack for Kody (nothing is sent or published)',
  whenToUse: 'Run by the patina-marketing skill with {brief, slug?, root?}. Stops at the human Midjourney hand-off; marketing-compose continues.',
  phases: [
    { title: 'Setup', detail: 'run folder, brief copy, preflight', model: 'haiku' },
    { title: 'Direction', detail: 'content test, concept, plan.json', model: 'fable' },
    { title: 'Drafts', detail: 'per piece: Opus draft and an independent Sol draft' },
    { title: 'Judge', detail: 'per piece: lint both, choose or merge, lint the final', model: 'fable' },
    { title: 'Cold read', detail: 'Sol reads the batch cold; Opus resolves and re-lints' },
    { title: 'Art direction', detail: 'refine jobs, plan-check, Midjourney prompt pack', model: 'opus' },
  ],
}

// Workflow cwd does not persist between agents: every path handed to an agent is absolute.
const ROOT = String((args && args.root) || '/Users/kody/Code/patina-merged').replace(/\/+$/, '')
const BRIEF_ARG = args && args.brief
const TOOLS = `${ROOT}/marketing/tools`
const CANON = `${ROOT}/marketing/canon`
const PROMPTS = `${ROOT}/marketing/prompts`
const VISION = `${ROOT}/docs/vision/VISION.md`

const FRONTMATTER = {
  social: '`headline`, `caption`, `hashtags` (a list of at most 4), `alt`',
  pin: '`headline`, `caption`, `hashtags` (a list of at most 4), `alt`',
  email: '`subject` (60 characters or fewer), `preheader`; the body is the email in Markdown',
  'one-pager': '`title`, `sections` (a list of {heading, body}), `cta`',
  deck: '`title`, `slides` (a list of {headline, body, visual?}; visual is a job id)',
  'pr-pitch': '`subject`; the body is the pitch in Markdown, 150 words or fewer',
  poster: '`headline`, `subhead`, `body`, `visual` (a job id)',
  video: '`title`, `scenes` (a list of {seconds, visual (a job id), onscreen, vo})',
}

function rules(writeScope) {
  return `RULES FOR THIS AGENT
- Repo root: ${ROOT}. Use absolute paths in every command and file call; the working directory does not carry over between agents.
- Write only inside ${writeScope}. Never edit canon, templates, tools or anything else in the repo. No git commands.
- Nothing leaves this machine: never send, post, schedule or publish anything (no email, no social posts, no CMS, no hosted pages). Output lands only in the run folder.
- Midjourney is a human hand-off: Kody makes the images by hand from the prompt pack. Never try to generate, fetch or request Midjourney images yourself.
- ${VISION} wins every conflict with any other document.`
}

const VOICE_RULES = `VOICE RULES THAT FAIL A PIECE: never "AI", "artificial intelligence", "machine learning", "algorithm" or "powered by" (say Designer-Taught Intelligence, outcome first); no Pledge language and never the held tagline; every number, percentage or dollar amount cites a verified claim from ${CANON}/claims.md as [Cnn] in the same sentence; the reader is a growing design studio at the moment it adds its first hire while the work doubles (homeowners and makers are the studio's clients and vendors); Midwest places only.`

const ledgerCmd = (run, entry) =>
  `node --input-type=module -e "import {appendLedger} from '${TOOLS}/lib/run.mjs'; appendLedger(process.argv[1], JSON.parse(process.argv[2]))" '${run}' '${JSON.stringify(entry)}'`

const lintCmd = (file, out) => `node ${TOOLS}/voice-lint.mjs ${file} --json > ${out}`

if (!BRIEF_ARG) return { status: 'blocked', reason: 'args.brief is required (repo-relative path to a brief, e.g. a copy of marketing/briefs/_template.md)' }
const BRIEF = String(BRIEF_ARG).startsWith('/') ? String(BRIEF_ARG) : `${ROOT}/${String(BRIEF_ARG).replace(/^\.\//, '')}`
const SLUG = String((args && args.slug) || BRIEF.split('/').pop().replace(/\.md$/, '').replace(/^\d{4}-\d{2}-/, ''))
  .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
if (!SLUG) return { status: 'blocked', reason: 'could not derive a slug; pass args.slug' }

// ---------------------------------------------------------------- A0 setup
phase('Setup')
const setup = await agent(`${rules(`${ROOT}/marketing/runs`)}

YOUR TASK (Press A0: setup). Do exactly these steps with Bash:
1. Run \`date +%F\`. Its output is DATE.
2. RUN is ${ROOT}/marketing/runs/DATE-${SLUG}. If RUN/plan.json already exists, stop and return ok=false with reason "run folder already holds plan.json; pass a different slug". Never delete or overwrite an existing run.
3. If ${BRIEF} does not exist, return ok=false with reason "brief not found: ${BRIEF}".
4. \`mkdir -p RUN/copy RUN/critique\`, then copy ${BRIEF} to RUN/brief.md.
5. Run \`node ${TOOLS}/preflight.mjs --json\`. It exits 1 only when a REQUIRED check fails. If it does, return ok=false and put each failed required check's name, detail and fix in reason. Optional checks that fail (mflux, ffmpeg, hyperframes, disk) are warnings: list each as "name: detail" in warnings and still return ok=true.
Return DATE in date.`, {
  label: 'A0:setup', phase: 'Setup', model: 'haiku',
  schema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'YYYY-MM-DD from date +%F' },
      ok: { type: 'boolean' },
      reason: { type: 'string' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['date', 'ok', 'reason', 'warnings'],
  },
})
if (!setup) return { status: 'blocked', reason: 'setup agent did not return' }
if (!setup.ok) return { status: 'blocked', reason: setup.reason }
if (!/^\d{4}-\d{2}-\d{2}$/.test(setup.date)) return { status: 'blocked', reason: `setup returned an invalid date: ${setup.date}` }

const RUN = `${ROOT}/marketing/runs/${setup.date}-${SLUG}`
const COPY = `${RUN}/copy`
const CRIT = `${RUN}/critique`
const RULES = rules(RUN)
for (const w of setup.warnings || []) log(`preflight warning: ${w}`)

// ---------------------------------------------------------------- A1 direction
phase('Direction')
const direction = await agent(`${RULES}

YOUR TASK (Press A1: direction). You set the batch's direction and hold the content test.
Read ${RUN}/brief.md, every Markdown file in ${CANON} (voice.md, claims.md, art-direction.md), ${CANON}/channels.json and ${VISION}.

1. Content test (VISION's feature test): which surface, which studio moment, which money stream, which promise does this batch serve? The audience must be a design studio (VISION §2). If the brief fails (no studio moment, the reader is a homeowner or maker as Patina's customer, it needs Pledge language or the held tagline, it exists to SEO strangers, it optimizes the studio surface for engagement), set pass=false with a one-paragraph reason.
2. Write ${RUN}/plan.json (plan v1):
{"version":1,"runId":"${setup.date}-${SLUG}",
 "contentTest":{"pass":true,"audience":"","moment":"","stream":"subscription|margin|both","promise":"","reason":""},
 "concept":{"name":"","idea":"","artDirection":""},
 "pieces":[{"id":"P01","kind":"social|pin|email|one-pager|deck|pr-pitch|poster|video","channel":"<a channels.json id>","angle":"","brief":"","claims":["C01"],"visuals":["J01"]}],
 "jobs":[{"id":"J01","pieceIds":["P01"],"kind":"still|video","channel":"<id>","prompt":"<Midjourney prompt text, no params>","params":"--ar 4:5 --style raw --v 8.1 --sref {{SREF}}","variants":3,"fluxPrompt":"","startFrom":"J0x (video jobs only: the still job it animates)"}]}
   Piece ids are P01, P02, ...; job ids J01, J02, .... Make the pieces the brief asks for (kind, channel, count). Claims list only ids whose status is verified in claims.md. Every piece's visuals and every job's pieceIds must reference ids that exist. Write first-pass jobs from art-direction.md (the --ar comes from the channel); a later step refines them.
   If pass=false, still write plan.json with contentTest.pass=false and the reason, and empty pieces and jobs.
3. If pass=true, run \`node ${TOOLS}/plan-check.mjs ${RUN}\` and fix plan.json until it exits 0. Report the remaining errors if you cannot.
Return pass, reason, planValid (plan-check exit 0), planErrors, and the pieces as {id, kind, channel}.`, {
  label: 'A1:direction', phase: 'Direction', model: 'fable',
  schema: {
    type: 'object',
    properties: {
      pass: { type: 'boolean' },
      reason: { type: 'string' },
      planValid: { type: 'boolean' },
      planErrors: { type: 'array', items: { type: 'string' } },
      pieces: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, kind: { type: 'string' }, channel: { type: 'string' } },
          required: ['id', 'kind', 'channel'],
        },
      },
    },
    required: ['pass', 'reason', 'pieces'],
  },
})
if (!direction) return { status: 'blocked', reason: 'direction agent did not return', runDir: RUN }
if (!direction.pass) return { status: 'refused', reason: direction.reason, runDir: RUN }
if (direction.planValid === false) return { status: 'blocked', reason: `plan.json failed plan-check: ${(direction.planErrors || []).join('; ')}`, runDir: RUN }
const PIECES = (direction.pieces || []).filter(p => /^P\d{2}$/.test(p.id) && FRONTMATTER[p.kind])
if (PIECES.length < (direction.pieces || []).length) log(`dropped ${(direction.pieces || []).length - PIECES.length} piece(s) with a bad id or unknown kind`)
if (!PIECES.length) return { status: 'blocked', reason: 'plan.json has no pieces', runDir: RUN }
log(`${PIECES.length} piece(s): ${PIECES.map(p => `${p.id} ${p.kind}`).join(', ')}`)

// ---------------------------------------------------------------- A2 drafts + A3 judge (per piece, no barrier)
function draftStage(p) {
  const opusOut = `${COPY}/${p.id}.opus.md`
  const solPrompt = `${COPY}/${p.id}.sol-prompt.md`
  const solOut = `${COPY}/${p.id}.sol.md`
  return parallel([
    () => agent(`${RULES}

YOUR TASK (Press A2: lead draft for ${p.id}, a ${p.kind} for ${p.channel}). Read ${RUN}/brief.md, ${RUN}/plan.json (your piece is ${p.id}: its angle, brief, claims and visuals; concept is the batch idea), ${CANON}/voice.md (§9 has the craft rules per kind), ${CANON}/claims.md and ${CANON}/channels.json.
Write ${opusOut}: YAML frontmatter with ${FRONTMATTER[p.kind]}, then the body the kind calls for. Another seat drafts the same piece independently; do not look for or read its draft.
${VOICE_RULES}
Run \`node ${TOOLS}/voice-lint.mjs ${opusOut}\` and fix every error before you return.`, {
      label: `A2:opus:${p.id}`, phase: 'Drafts', model: 'opus',
      schema: { type: 'object', properties: { written: { type: 'boolean' }, note: { type: 'string' } }, required: ['written', 'note'] },
    }),
    () => agent(`${RULES}

YOUR TASK (Press A2: Sol rival draft for ${p.id}). Mechanical steps only; do not write copy yourself.
1. Read ${PROMPTS}/sol-draft.md. Write ${solPrompt} with these exact replacements: {{piece}} -> ${p.id}; {{kind}} -> ${p.kind}; {{channel}} -> ${p.channel}; {{frontmatter}} -> ${FRONTMATTER[p.kind]}. Change nothing else.
2. Run: node ${TOOLS}/sol.mjs ${solPrompt} ${solOut} ${CANON}/voice.md ${CANON}/claims.md ${RUN}/brief.md ${RUN}/plan.json --run ${RUN} --piece ${p.id} --seat sol-draft
3. ok=true only if the command exited 0 and ${solOut} exists and is not empty. Otherwise ok=false and detail = the last lines of its error output. Do not retry more than once.`, {
      label: `A2:sol:${p.id}`, phase: 'Drafts', model: 'haiku',
      schema: { type: 'object', properties: { ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['ok', 'detail'] },
    }),
  ]).then(([opus, sol]) => ({
    opus: !!(opus && opus.written),
    sol: !!(sol && sol.ok),
    solReason: sol ? sol.detail : 'sol agent did not return',
  }))
}

function judgeStage(d, p) {
  if (!d.opus && !d.sol) return { id: p.id, status: 'draft-failed', sol: 'unavailable' }
  const seats = [d.opus && 'opus', d.sol && 'sol'].filter(Boolean)
  const final = `${COPY}/${p.id}.final.md`
  const lintLines = seats.map(s => `   ${lintCmd(`${COPY}/${p.id}.${s}.md`, `${CRIT}/lint-${p.id}.${s}.json`)}`).join('\n')
  const solNote = d.sol
    ? `The Sol draft opens with a provenance HTML comment; ignore it.`
    : `The Sol seat was unavailable (${d.solReason}). Judge the Opus draft alone, and record it in the ledger first:\n   ${ledgerCmd(RUN, { seat: 'sol-draft', piece: p.id, status: 'unavailable' })}`
  return agent(`${RULES}

YOUR TASK (Press A3: judge ${p.id}, a ${p.kind} for ${p.channel}). Read ${RUN}/plan.json (piece ${p.id}), ${CANON}/voice.md and ${CANON}/claims.md.
1. Lint each draft (voice-lint exits 1 when it finds errors; that is expected):
${lintLines}
2. ${solNote}
3. Choose the stronger draft or merge the best of both into ${final}: YAML frontmatter with ${FRONTMATTER[p.kind]}, then the body the kind calls for. Judge for the studio owner at the first-hire moment: specific, true, calm, outcome first.
${VOICE_RULES}
4. Run ${lintCmd(final, `${CRIT}/lint-${p.id}.json`)} and read the result. If it has errors, fix the final and lint again: at most 2 fix attempts. status=ok when the last lint has zero errors, otherwise status=lint-failed with the remaining errors.`, {
    label: `A3:judge:${p.id}`, phase: 'Judge', model: 'fable',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'lint-failed'] },
        chose: { type: 'string', enum: ['opus', 'sol', 'merge'] },
        errors: { type: 'array', items: { type: 'string' } },
      },
      required: ['status', 'chose', 'errors'],
    },
  }).then(j => ({
    id: p.id,
    status: j ? j.status : 'judge-failed',
    chose: j ? j.chose : null,
    sol: d.sol ? 'ok' : 'unavailable',
  }))
}

phase('Drafts')
const judged = await pipeline(PIECES, p => draftStage(p), (d, p) => judgeStage(d, p))
const results = PIECES.map((p, i) => judged[i] || { id: p.id, status: 'judge-failed', sol: 'unknown' })
const withFinal = results.filter(r => r.status === 'ok' || r.status === 'lint-failed')
if (!withFinal.length) return { status: 'blocked', reason: 'no piece produced a final draft', runDir: RUN, pieces: results }

// ---------------------------------------------------------------- A4 cold read
phase('Cold read')
const finals = withFinal.map(r => `${COPY}/${r.id}.final.md`)
const ids = withFinal.map(r => r.id).join(', ')
const cold = await agent(`${RULES}

YOUR TASK (Press A4: Sol cold read). Mechanical steps only.
1. Read ${PROMPTS}/sol-cold-read.md. Write ${CRIT}/cold-read.sol-prompt.md with these exact replacements: {{run}} -> ${RUN}; {{pieces}} -> ${ids}. Change nothing else.
2. Run: node ${TOOLS}/sol.mjs ${CRIT}/cold-read.sol-prompt.md ${CRIT}/cold-read.sol.md ${finals.join(' ')} ${CANON}/voice.md ${CANON}/claims.md --run ${RUN} --seat sol-cold-read
3. ok=true only if it exited 0 and ${CRIT}/cold-read.sol.md is not empty. Otherwise record it with
   ${ledgerCmd(RUN, { seat: 'sol-cold-read', status: 'unavailable' })}
   and return ok=false with the last lines of the error output in detail.`, {
  label: 'A4:cold-read:sol', phase: 'Cold read', model: 'haiku',
  schema: { type: 'object', properties: { ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['ok', 'detail'] },
})

let coldRead = 'unavailable'
if (cold && cold.ok) {
  const relint = finals.map(f => `   ${lintCmd(f, `${CRIT}/lint-${f.split('/').pop().split('.')[0]}.json`)}`).join('\n')
  const applied = await agent(`${RULES}

YOUR TASK (Press A4: resolve the cold read). Read ${CRIT}/cold-read.sol.md: a studio owner at the first-hire moment read the batch cold and listed what is vague, untrue, salesy, off-voice or not for them. Also read ${CANON}/voice.md and ${CANON}/claims.md.
1. For every finding, decide accept or reject. Write ${CRIT}/cold-read.resolution.md: one line per finding, "P0x #n: accept|reject: <one-sentence reason>".
2. Apply the accepted findings by editing the finals (${finals.join(', ')}). Keep each file's frontmatter fields and kind. Do not touch the drafts.
${VOICE_RULES}
3. Re-lint every final:
${relint}
   Report each piece's error count from its lint file.`, {
    label: 'A4:cold-read:apply', phase: 'Cold read', model: 'opus',
    schema: {
      type: 'object',
      properties: {
        pieces: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, errors: { type: 'integer' } }, required: ['id', 'errors'] },
        },
      },
      required: ['pieces'],
    },
  })
  if (applied) {
    coldRead = 'applied'
    for (const r of applied.pieces || []) {
      const hit = results.find(x => x.id === r.id)
      if (hit && (hit.status === 'ok' || hit.status === 'lint-failed')) hit.status = r.errors > 0 ? 'lint-failed' : 'ok'
    }
  } else {
    coldRead = 'resolve-failed'
  }
} else {
  log(`cold read unavailable: ${cold ? cold.detail : 'agent did not return'}; finals keep their judge status`)
}

// ---------------------------------------------------------------- A5 art direction
phase('Art direction')
const art = await agent(`${RULES}

YOUR TASK (Press A5: art direction). Read ${CANON}/art-direction.md, ${CANON}/channels.json, ${RUN}/plan.json and the finals in ${COPY} (files ending .final.md).
1. Refine the jobs in ${RUN}/plan.json against art-direction.md: one clear Midjourney prompt per job (no params in prompt), params with the channel's --ar plus the house tail, variants, a fluxPrompt for the local placeholder, startFrom on video jobs. Keep every job id that a final or a piece's visuals references. Do not change contentTest, concept or the pieces' copy fields.
2. Run \`node ${TOOLS}/plan-check.mjs ${RUN}\` and fix plan.json until it exits 0.
3. Run \`node ${TOOLS}/mj-pack.mjs ${RUN}\`. It writes ${RUN}/mj/prompts.md and ${RUN}/mj/jobs.json and makes the inbox folders. Report its warnings (an unset SREF is a warning, not a failure).`, {
  label: 'A5:art-direction', phase: 'Art direction', model: 'opus',
  schema: {
    type: 'object',
    properties: { ok: { type: 'boolean' }, warnings: { type: 'array', items: { type: 'string' } }, errors: { type: 'array', items: { type: 'string' } } },
    required: ['ok', 'warnings', 'errors'],
  },
})
const pieces = results.map(r => ({ id: r.id, status: r.status, sol: r.sol }))
if (!art || !art.ok) {
  return { status: 'blocked', reason: `art direction failed: ${art ? art.errors.join('; ') : 'agent did not return'}`, runDir: RUN, pieces }
}
for (const w of art.warnings || []) log(`mj-pack: ${w}`)

return {
  status: 'awaiting-midjourney',
  runDir: RUN,
  promptsPath: `${RUN}/mj/prompts.md`,
  coldRead,
  preflightWarnings: setup.warnings || [],
  pieces,
}
