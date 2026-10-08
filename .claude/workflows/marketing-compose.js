export const meta = {
  name: 'marketing-compose',
  description: 'The Press, phase B: Midjourney images in, composed and rendered pieces reviewed, review board written (nothing is sent or published)',
  whenToUse: 'Run by the patina-marketing skill with {run} after Kody drops images, or {run, pieces, feedback} to revise named pieces.',
  phases: [
    { title: 'Revise', detail: 'targeted copy redo with feedback (revise runs only)', model: 'fable' },
    { title: 'Ingest', detail: 'assets.json, FLUX placeholders, piece list, lint status', model: 'haiku' },
    { title: 'Picks', detail: 'choose one image per job', model: 'opus' },
    { title: 'Compose', detail: 'template pieces by tool; deck and video by Opus' },
    { title: 'Render', detail: 'Playwright and HyperFrames renders', model: 'haiku' },
    { title: 'Review', detail: 'Fable review and Sol render review in parallel' },
    { title: 'Fix', detail: 'one fix pass: copy, lint, compose, render', model: 'sonnet' },
    { title: 'Board', detail: 'single-file review board', model: 'haiku' },
  ],
}

// Workflow cwd does not persist between agents: every path handed to an agent is absolute.
const ROOT = String((args && args.root) || '/Users/kody/Code/patina-merged').replace(/\/+$/, '')
const RUN_ARG = args && args.run
const TOOLS = `${ROOT}/marketing/tools`
const CANON = `${ROOT}/marketing/canon`
const PROMPTS = `${ROOT}/marketing/prompts`
const TEMPLATES = `${ROOT}/marketing/templates`
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

if (!RUN_ARG) return { status: 'blocked', reason: 'args.run is required (the run folder from marketing-draft)' }
const RUN = String(RUN_ARG).startsWith('/') ? String(RUN_ARG).replace(/\/+$/, '') : `${ROOT}/${String(RUN_ARG).replace(/^\.\//, '').replace(/\/+$/, '')}`
const COPY = `${RUN}/copy`
const CRIT = `${RUN}/critique`
const TARGETS = Array.isArray(args && args.pieces) ? args.pieces.map(String) : null
const FEEDBACK = args && typeof args.feedback === 'string' && args.feedback.trim() ? args.feedback.trim() : null
if (FEEDBACK && !(TARGETS && TARGETS.length)) return { status: 'blocked', reason: 'feedback needs pieces: pass {run, pieces: ["P02"], feedback}' }
if (TARGETS && TARGETS.some(id => !/^P\d{2}$/.test(id))) return { status: 'blocked', reason: `bad piece id in ${JSON.stringify(TARGETS)}` }

const RULES = `RULES FOR THIS AGENT
- Repo root: ${ROOT}. This run's folder: ${RUN}. Use absolute paths in every command and file call; the working directory does not carry over between agents.
- Write only inside ${RUN}. Never edit canon, templates, tools or anything else in the repo. No git commands.
- Nothing leaves this machine: never send, post, schedule or publish anything (no email, no social posts, no CMS, no hosted pages). The main session decides what to share after Kody reviews the board.
- Midjourney is a human hand-off: Kody made the images by hand and dropped them in the inbox. Never try to generate, fetch or request Midjourney images yourself.
- ${VISION} wins every conflict with any other document.`

const VOICE_RULES = `VOICE RULES THAT FAIL A PIECE: never "AI", "artificial intelligence", "machine learning", "algorithm" or "powered by" (say Designer-Taught Intelligence, outcome first); no Pledge language and never the held tagline; every number, percentage or dollar amount cites a verified claim from ${CANON}/claims.md as [Cnn] in the same sentence; the reader is a growing design studio at the moment it adds its first hire while the work doubles; Midwest places only.`

const lintCmd = (id) => `node ${TOOLS}/voice-lint.mjs ${COPY}/${id}.final.md --json > ${CRIT}/lint-${id}.json`
// Run-wide tools take --piece per target on a revise run so other pieces stay untouched.
const toolCmds = (tool, ids) => (ids ? ids.map(id => `node ${TOOLS}/${tool}.mjs ${RUN} --piece ${id}`) : [`node ${TOOLS}/${tool}.mjs ${RUN}`])
const scopeLine = (ids) => (ids ? `Work on these pieces only: ${ids.join(', ')}. Leave every other piece's files untouched.` : 'Work on every piece in the plan.')

// ---------------------------------------------------------------- B0 revise (targeted runs only)
const revised = {}
if (FEEDBACK) {
  phase('Revise')
  const rev = await parallel(TARGETS.map(id => () => agent(`${RULES}

YOUR TASK (Press revise: ${id}). Kody reviewed the board and asked for this change to ${id}:
"""
${FEEDBACK}
"""
Read ${RUN}/plan.json (piece ${id}), ${COPY}/${id}.final.md, the drafts ${COPY}/${id}.opus.md and ${COPY}/${id}.sol.md if they exist, ${CANON}/voice.md and ${CANON}/claims.md.
1. Rewrite ${COPY}/${id}.final.md to answer the feedback. Keep the frontmatter fields for its kind (see ${CANON}/voice.md §9) and keep its job ids unless the feedback asks for a different image.
${VOICE_RULES}
2. Run ${lintCmd(id)} and read the result. If it has errors, fix and lint again: at most 2 fix attempts. status=ok when the last lint has zero errors, otherwise lint-failed with the remaining errors.`, {
    label: `B0:revise:${id}`, phase: 'Revise', model: 'fable',
    schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok', 'lint-failed'] }, errors: { type: 'array', items: { type: 'string' } } },
      required: ['status', 'errors'],
    },
  })))
  TARGETS.forEach((id, i) => { revised[id] = rev[i] ? rev[i].status : 'revise-failed' })
}

// ---------------------------------------------------------------- B1 ingest
phase('Ingest')
const ingest = await agent(`${RULES}

YOUR TASK (Press B1: ingest). Mechanical steps only.
1. Run \`node ${TOOLS}/ingest.mjs ${RUN}\`. It writes ${RUN}/mj/assets.json and fills empty jobs with local FLUX placeholders when mflux is installed. Report each job whose source is "flux-placeholder" or "missing".
2. Read ${RUN}/plan.json and list every piece as {id, kind, channel, visuals}.
3. Run \`node ${TOOLS}/voice-lint.mjs ${COPY} --json\` (it lints the .final.md files; exit 1 just means errors were found) and give each piece's error count as lintErrors.
ok=false only if ingest.mjs exited non-zero or plan.json is unreadable; put the error in detail.`, {
  label: 'B1:ingest', phase: 'Ingest', model: 'haiku',
  schema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      detail: { type: 'string' },
      placeholders: { type: 'array', items: { type: 'string' } },
      missing: { type: 'array', items: { type: 'string' } },
      pieces: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' }, kind: { type: 'string' }, channel: { type: 'string' },
            visuals: { type: 'array', items: { type: 'string' } }, lintErrors: { type: 'integer' },
          },
          required: ['id', 'kind', 'channel', 'visuals', 'lintErrors'],
        },
      },
    },
    required: ['ok', 'detail', 'pieces'],
  },
})
if (!ingest || !ingest.ok) return { status: 'blocked', reason: `ingest failed: ${ingest ? ingest.detail : 'agent did not return'}`, runDir: RUN }
const ALL = ingest.pieces.filter(p => /^P\d{2}$/.test(p.id))
if (TARGETS) {
  const unknown = TARGETS.filter(id => !ALL.some(p => p.id === id))
  if (unknown.length) return { status: 'blocked', reason: `pieces not in plan.json: ${unknown.join(', ')}`, runDir: RUN }
}
const PIECES = TARGETS ? ALL.filter(p => TARGETS.includes(p.id)) : ALL
const IDS = TARGETS ? PIECES.map(p => p.id) : null
if (!PIECES.length) return { status: 'blocked', reason: 'plan.json has no pieces', runDir: RUN }
for (const j of ingest.placeholders || []) log(`${j}: FLUX placeholder (no Midjourney files in the inbox)`)
for (const j of ingest.missing || []) log(`${j}: no image at all`)

// ---------------------------------------------------------------- B2 picks
phase('Picks')
const jobs = [...new Set(PIECES.flatMap(p => p.visuals || []))]
await agent(`${RULES}

YOUR TASK (Press B2: picks). Read ${CANON}/art-direction.md, ${RUN}/plan.json and ${RUN}/mj/assets.json.
For each of these jobs: ${jobs.join(', ') || '(none)'}, open every candidate file listed in assets.json with the Read tool and look at it. Pick the one image that best fits art-direction.md and the pieces that use the job (their channel crop, where text will sit). A FLUX placeholder is only a stand-in; pick it only when it is the sole file.
Write ${RUN}/mj/picks.json as {"J01": "<absolute path of the picked file>", ...}. If the file already exists, keep the entries for other jobs and replace only these jobs. Add ${CRIT}/picks.md with one line per job: the pick and why.`, {
  label: 'B2:picks', phase: 'Picks', model: 'opus',
})

// ---------------------------------------------------------------- B3 compose
phase('Compose')
const templ = PIECES.filter(p => p.kind !== 'deck' && p.kind !== 'video')
const composeTool = templ.length ? await agent(`${RULES}

YOUR TASK (Press B3: compose template pieces). Mechanical steps only. Run each command and report its output:
${toolCmds('compose', IDS && templ.map(p => p.id)).join('\n')}
It fills the HTML templates in ${TEMPLATES} for social, pin, poster, one-pager and email pieces, writes a plain pitch.md for pr-pitch, and skips deck and video. ok=false if any command exited non-zero.`, {
  label: 'B3:compose', phase: 'Compose', model: 'haiku',
  schema: { type: 'object', properties: { ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['ok', 'detail'] },
}) : { ok: true, detail: 'no template pieces' }

const handBuilt = PIECES.filter(p => p.kind === 'deck' || p.kind === 'video')
const handResults = await parallel(handBuilt.map(p => () => agent(p.kind === 'deck'
  ? `${RULES}

YOUR TASK (Press B3: compose deck ${p.id}). Read ${COPY}/${p.id}.final.md (title, slides), ${CANON}/art-direction.md, ${RUN}/mj/picks.json and ${RUN}/mj/assets.json.
Copy the folder ${TEMPLATES}/deck to ${RUN}/compose/${p.id} (so ${RUN}/compose/${p.id}/index.html exists), then follow the "How an agent fills it" comment at the top of that index.html: fill every SLOT, one content slide per slides[] entry, picked images copied next to index.html and referenced relatively, [Cnn] markers stripped. Edit only files under ${RUN}/compose/${p.id}.`
  : `${RULES}

YOUR TASK (Press B3: compose video ${p.id} for ${p.channel}). First load the hyperframes skills with the Skill tool: "hyperframes-core" (the composition contract), then "hyperframes" if you need more. Read ${TEMPLATES}/video/README.md and follow it exactly: copy the folder for this channel (${TEMPLATES}/video/9x16 for video-9x16, ${TEMPLATES}/video/16x9 for video-16x9) to ${RUN}/compose/${p.id}, put the picked stills from ${RUN}/mj/picks.json and any clips from ${RUN}/mj/inbox into ${RUN}/compose/${p.id}/assets, and build the scenes from ${COPY}/${p.id}.final.md (title, scenes). Replace both placeholder assets. Stay within the channel's max length.
Then run \`npx -y hyperframes@0.8.142 lint ${RUN}/compose/${p.id}\` and fix until it reports 0 errors. Edit only files under ${RUN}/compose/${p.id}.`, {
  label: `B3:${p.kind}:${p.id}`, phase: 'Compose', model: 'opus',
  schema: { type: 'object', properties: { ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['ok', 'detail'] },
})))
const composeFailed = new Set(handBuilt.filter((p, i) => !(handResults[i] && handResults[i].ok)).map(p => p.id))
if (composeTool && !composeTool.ok) log(`compose.mjs reported a failure: ${composeTool.detail}`)

// ---------------------------------------------------------------- B4 render
const RENDER_SCHEMA = {
  type: 'object',
  properties: {
    pieces: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['ok', 'skipped', 'failed'] },
          outputs: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
        required: ['id', 'status', 'outputs'],
      },
    },
  },
  required: ['pieces'],
}
const renderSteps = `${toolCmds('render', IDS).join('\n')}
render.mjs prints one line per piece: "<id> (<kind>): ok <output relative to the run>" or "skipped (<reason>)" or "failed (<reason>)". After it runs, list ${RUN}/out/<piece id> for each piece and report every file there as an absolute path in outputs. Report a skipped video as status skipped with its reason; never drop it.`

phase('Render')
const render = await agent(`${RULES}

YOUR TASK (Press B4: render). Mechanical steps only. Run:
${renderSteps}`, { label: 'B4:render', phase: 'Render', model: 'haiku', schema: RENDER_SCHEMA })
const rendered = {}
for (const r of (render && render.pieces) || []) rendered[r.id] = r

// ---------------------------------------------------------------- B5 review
phase('Review')
const scope = scopeLine(IDS)
const [review, solReview] = await parallel([
  () => agent(`${RULES}

YOUR TASK (Press B5: review the rendered pieces). ${scope}
Read ${CANON}/voice.md, ${CANON}/art-direction.md and ${CANON}/channels.json. Look at every rendered output in ${RUN}/out/<piece id>/: open PNGs with the Read tool, PDFs with the Read tool's pages option (the first pages are enough for a deck), and for a video open its poster frame or the composition at ${RUN}/compose/<piece id>/index.html. Compare each against its final copy in ${COPY}.
Judge as the studio owner at the first-hire moment: legibility at real size, crop and composition for the channel, palette and type per art-direction.md, copy that reads vague, untrue, salesy or off-voice, any rule break.
${VOICE_RULES}
Write ${CRIT}/review.md: one section per piece, every finding with severity (high, medium, low), what you see, and the concrete fix. Report every finding; do not filter.`, {
    label: 'B5:review', phase: 'Review', model: 'fable',
    schema: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: { piece: { type: 'string' }, severity: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } },
            required: ['piece', 'severity', 'issue', 'fix'],
          },
        },
      },
      required: ['findings'],
    },
  }),
  () => agent(`${RULES}

YOUR TASK (Press B5: Sol render review). Mechanical steps only. ${scope}
1. Read ${PROMPTS}/sol-render-review.md. Write ${CRIT}/review.sol-prompt.md with these exact replacements: {{run}} -> ${RUN}; {{pieces}} -> ${PIECES.map(p => p.id).join(', ')}. Change nothing else.
2. Collect the absolute paths of every .png file in ${RUN}/out/<piece id>/ for those pieces (PNG only: sol.mjs sends images; skip PDFs and MP4s).
3. Run: node ${TOOLS}/sol.mjs ${CRIT}/review.sol-prompt.md ${CRIT}/review.sol.md <the PNG paths> ${CANON}/voice.md ${CANON}/art-direction.md --run ${RUN} --seat sol-render-review
4. ok=true only if it exited 0 and ${CRIT}/review.sol.md is not empty; otherwise ok=false with the last lines of the error output. No PNGs at all: skip step 3 and return ok=false, detail "no PNG renders".`, {
    label: 'B5:review:sol', phase: 'Review', model: 'haiku',
    schema: { type: 'object', properties: { ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['ok', 'detail'] },
  }),
])
const findings = (review && review.findings) || []
if (!review) log('Fable review did not return; the fix pass works from the Sol review only')
if (!(solReview && solReview.ok)) log(`Sol render review unavailable: ${solReview ? solReview.detail : 'agent did not return'}`)

// ---------------------------------------------------------------- B6 fix
let fix = null
if (findings.length || (solReview && solReview.ok)) {
  phase('Fix')
  const sources = [review && `${CRIT}/review.md`, solReview && solReview.ok && `${CRIT}/review.sol.md`].filter(Boolean).join(' and ')
  fix = await agent(`${RULES}

YOUR TASK (Press B6: one fix pass). ${scope}
Read ${sources}. Apply the findings you agree with; skip the ones that contradict ${CANON}/voice.md, ${CANON}/art-direction.md or the brief, and say why in ${CRIT}/fix-notes.md (one line per finding: applied or skipped, and why).
- Copy fixes: edit ${COPY}/<piece id>.final.md, keep its frontmatter fields, then run \`node ${TOOLS}/voice-lint.mjs ${COPY}/<piece id>.final.md --json > ${CRIT}/lint-<piece id>.json\` and fix until it has zero errors.
${VOICE_RULES}
- Template pieces (social, pin, poster, one-pager, email, pr-pitch): never hand-edit ${RUN}/compose; re-run \`node ${TOOLS}/compose.mjs ${RUN} --piece <piece id>\` after the copy change.
- Deck and video pieces: edit ${RUN}/compose/<piece id> directly (for video, run \`npx -y hyperframes@0.8.142 lint ${RUN}/compose/<piece id>\` to 0 errors).
- Then re-render each changed piece: \`node ${TOOLS}/render.mjs ${RUN} --piece <piece id>\`.
This is a single pass: do not loop on the review. Report every changed piece with its final lint error count and its render result (status, absolute output paths, reason).`, {
    label: 'B6:fix', phase: 'Fix', model: 'sonnet',
    schema: {
      type: 'object',
      properties: {
        pieces: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              lintErrors: { type: 'integer' },
              status: { type: 'string', enum: ['ok', 'skipped', 'failed'] },
              outputs: { type: 'array', items: { type: 'string' } },
              reason: { type: 'string' },
            },
            required: ['id', 'lintErrors', 'status', 'outputs'],
          },
        },
      },
      required: ['pieces'],
    },
  })
}
const fixed = {}
for (const r of (fix && fix.pieces) || []) fixed[r.id] = r

// ---------------------------------------------------------------- B7 board
phase('Board')
const board = await agent(`${RULES}

YOUR TASK (Press B7: board). Mechanical steps only. Run \`node ${TOOLS}/board.mjs ${RUN}\`. It writes ${RUN}/board.html and prints its size. ok=false if it exited non-zero; put the error in detail. Do not open, upload or share the board.`, {
  label: 'B7:board', phase: 'Board', model: 'haiku',
  schema: { type: 'object', properties: { ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['ok', 'detail'] },
})

const pieces = PIECES.map(p => {
  const r = fixed[p.id] || rendered[p.id] || { status: 'failed', outputs: [], reason: 'no render result' }
  const lintErrors = fixed[p.id] ? fixed[p.id].lintErrors : p.lintErrors
  let status = r.status === 'ok' ? 'rendered' : r.status === 'skipped' ? 'render-skipped' : 'render-failed'
  if (composeFailed.has(p.id) && r.status !== 'ok') status = 'compose-failed'
  if (revised[p.id] && revised[p.id] !== 'ok') status = revised[p.id]
  else if (lintErrors > 0) status = 'lint-failed'
  return { id: p.id, kind: p.kind, status, outputs: r.outputs || [], reason: r.reason || undefined }
})

if (!board || !board.ok) {
  return { status: 'blocked', reason: `board.mjs failed: ${board ? board.detail : 'agent did not return'}`, runDir: RUN, pieces }
}
return {
  status: 'ready-for-review',
  board: `${RUN}/board.html`,
  runDir: RUN,
  reviewFindings: findings.length,
  solReview: solReview && solReview.ok ? 'ok' : 'unavailable',
  pieces,
}
